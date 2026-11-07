import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import type { PayOS } from "@payos/node";
import { APIError } from "@payos/node";

import {
  createPayosClient,
  parseLinkTtlMinutes,
  PAYOS_CURRENCY,
  type PayosConfig,
} from "../../lib/payos/config";
import {
  checkoutReturnUrl,
  newOrderCode,
  secondsFromNow,
  sessionStatusOf,
  toVndAmount,
  transferDescription,
} from "./utils";

export type PayosProviderOptions = Partial<PayosConfig> & {
  /** Accepted as a string because it comes from the environment. */
  linkTtlMinutes?: number | string;
};

type InjectedDependencies = {
  logger: Logger;
};

/** What the provider keeps in `payment_session.data`. */
export type PayosSessionData = {
  session_id?: string;
  order_code: number;
  payment_link_id: string;
  checkout_url: string;
  amount: number;
  /** Unix seconds; after this the link no longer accepts payment. */
  expires_at: number;
  status: string;
};

const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const orderCodeOf = (data: Record<string, unknown> | undefined): number => {
  const code = Number(data?.order_code);
  if (!(Number.isSafeInteger(code) && code > 0)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "payOS payment session has no order_code"
    );
  }
  return code;
};

/** Message without anything that could carry a credential. */
const describe = (error: unknown): string => {
  if (error instanceof APIError) {
    return `HTTP ${String(error.status ?? "?")} ${error.code ?? ""} ${error.desc ?? ""}`.trim();
  }
  return error instanceof Error ? error.message : String(error);
};

/**
 * Payment provider for payOS (https://payos.vn): VietQR / Napas 247 bank
 * transfer through a hosted payment page.
 *
 * Flow: `initiatePayment` creates a payment link; the storefront sends the
 * customer to `data.checkout_url`; when the customer returns, completing the
 * cart calls `authorizePayment`, which asks payOS for the real status, so a
 * forged return URL proves nothing. The `/webhooks/payos` route is a second,
 * server-to-server path that completes the order when the customer never
 * comes back.
 *
 * A bank transfer settles at once, so there is no separate capture: a paid
 * link is reported as `captured`.
 *
 * Refunds: payOS has no refund API for collected payments. Staff send the
 * money back from the bank and then record it with
 * `POST /admin/returns/:id/refund`; `refundPayment` only books it in Medusa.
 */
class PayosProviderService extends AbstractPaymentProvider<PayosProviderOptions> {
  static identifier = "payos";

  protected readonly logger_: Logger;
  protected readonly options_: PayosProviderOptions;
  protected readonly client_: PayOS;

  static validateOptions(options: PayosProviderOptions): void {
    for (const key of [
      "clientId",
      "apiKey",
      "checksumKey",
      "storefrontUrl",
    ] as const) {
      if (!stringOf(options[key])) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Required option \`${key}\` is missing in the payOS payment provider`
        );
      }
    }
  }

  constructor(container: InjectedDependencies, options: PayosProviderOptions) {
    super(container, options);
    this.logger_ = container.logger;
    this.options_ = options;
    this.client_ = createPayosClient({
      clientId: options.clientId ?? "",
      apiKey: options.apiKey ?? "",
      checksumKey: options.checksumKey ?? "",
      partnerCode: options.partnerCode,
      baseUrl: options.baseUrl,
    });
  }

  private async createLink(input: {
    amount: number;
    data?: Record<string, unknown>;
  }): Promise<PayosSessionData> {
    const orderCode = newOrderCode();
    const returnUrl = checkoutReturnUrl({
      storefrontUrl: this.options_.storefrontUrl ?? "",
      locale: input.data?.locale,
      country_code: input.data?.country_code,
    });
    const expiresAt = secondsFromNow(
      parseLinkTtlMinutes(this.options_.linkTtlMinutes)
    );
    try {
      const link = await this.client_.paymentRequests.create({
        orderCode,
        amount: input.amount,
        description: transferDescription(orderCode),
        returnUrl,
        cancelUrl: returnUrl,
        expiredAt: expiresAt,
      });
      return {
        session_id: stringOf(input.data?.session_id),
        order_code: orderCode,
        payment_link_id: link.paymentLinkId,
        checkout_url: link.checkoutUrl,
        amount: input.amount,
        expires_at: expiresAt,
        status: link.status,
      };
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `payOS could not create the payment link: ${describe(error)}`
      );
    }
  }

  /** Cancels a link nobody paid. Never throws: a stale link just expires. */
  private async cancelLinkQuietly(orderCode: number): Promise<void> {
    try {
      const link = await this.client_.paymentRequests.get(orderCode);
      if (link.status !== "PENDING") {
        return;
      }
      await this.client_.paymentRequests.cancel(
        orderCode,
        "Replaced or abandoned"
      );
    } catch (error) {
      this.logger_.warn(
        `[payos] could not cancel link ${String(orderCode)}: ${describe(error)}`
      );
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    if (input.currency_code.toLowerCase() !== PAYOS_CURRENCY) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "payOS accepts VND only"
      );
    }
    const data = await this.createLink({
      amount: toVndAmount(input.amount),
      data: input.data,
    });
    return {
      id: data.payment_link_id,
      status: PaymentSessionStatus.PENDING,
      data: data as unknown as Record<string, unknown>,
    };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const amount = toVndAmount(input.amount);
    const current = input.data as Partial<PayosSessionData> | undefined;
    if (current?.amount === amount) {
      return { data: input.data, status: PaymentSessionStatus.PENDING };
    }
    // The cart total changed: the old link asks for the wrong sum. Never
    // replace a link the customer already paid.
    const orderCode = orderCodeOf(input.data);
    const link = await this.client_.paymentRequests.get(orderCode);
    if (link.status === "PAID" || link.status === "UNDERPAID") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This cart was already paid through payOS for a different amount. Contact support."
      );
    }
    await this.cancelLinkQuietly(orderCode);
    const data = await this.createLink({ amount, data: input.data });
    return {
      data: data as unknown as Record<string, unknown>,
      status: PaymentSessionStatus.PENDING,
    };
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const orderCode = orderCodeOf(input.data);
    let link: Awaited<ReturnType<PayOS["paymentRequests"]["get"]>>;
    try {
      link = await this.client_.paymentRequests.get(orderCode);
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `payOS could not read payment ${String(orderCode)}: ${describe(error)}`
      );
    }
    return {
      status: sessionStatusOf(link.status),
      data: {
        ...input.data,
        status: link.status,
        amount_paid: link.amountPaid,
      },
    };
  }

  /**
   * Called when the cart is completed. payOS is the source of truth, so the
   * status is read from payOS and nothing the browser sent is trusted.
   */
  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    return await this.getPaymentStatus(input);
  }

  /** A bank transfer is already settled; there is nothing left to capture. */
  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const code = Number(input.data?.order_code);
    if (Number.isSafeInteger(code) && code > 0) {
      await this.cancelLinkQuietly(code);
    }
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return await this.cancelPayment(input);
  }

  /** Books the refund in Medusa only; the transfer itself is done by staff. */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    this.logger_.info(
      `[payos] refund of ${String(new BigNumber(input.amount).numeric)} VND recorded in Medusa for order code ${String(input.data?.order_code)}; the bank transfer is done manually`
    );
    return { data: input.data };
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const status = await this.getPaymentStatus(input);
    return { data: status.data };
  }

  /** Payments are completed by the `/webhooks/payos` route, not by Medusa's hook. */
  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return await Promise.resolve({ action: PaymentActions.NOT_SUPPORTED });
  }
}

export default PayosProviderService;
