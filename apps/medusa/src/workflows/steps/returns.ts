import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows";

import {
  DEFAULT_CARRIER,
  getCarrierProvider,
} from "../../integrations/carrier/registry";
import { domainError, ErrorCodes } from "../../lib/errors";
import { isEnabled } from "../../lib/feature-flags";
import { senderFromEnv } from "../../lib/fulfillment/build-request";
import { createCarrierShipment } from "../../lib/fulfillment/create-shipment";
import { FINISHED_GOODS_MODULE } from "../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../modules/finishedGoods/service";
import { FASHION_FULFILLMENT_MODULE } from "../../modules/fulfillment";
import type FulfillmentModuleService from "../../modules/fulfillment/service";
import { RETURNS_MODULE } from "../../modules/returns";
import {
  evaluateReturnEligibility,
  type RequestedItem,
} from "../../modules/returns/lib/eligibility";
import { returnedValue } from "../../modules/returns/lib/refund-cap";
import type ReturnsModuleService from "../../modules/returns/service";
import type { InspectItemInput } from "../../modules/returns/types";
import { wrapStep, type Resolver } from "./wrap";

const rma = (c: Resolver) => c.resolve<ReturnsModuleService>(RETURNS_MODULE);
type QueryGraph = {
  graph: (
    q: Record<string, unknown>
  ) => Promise<{ data: Array<Record<string, any>> }>;
};
type Cmd = {
  actor_id: string;
  correlation_id?: string | null;
  idempotency_key: string;
};
type Actor = { actor_id: string; correlation_id?: string | null };

const DEFAULT_RETURN_WINDOW_DAYS = 14;

export type RequestReturnWorkflowInput = Cmd & {
  order_id: string;
  /** Set by customer-facing routes: the order must belong to this customer. */
  customer_id?: string | null;
  type: "RETURN" | "EXCHANGE";
  reason: string;
  exchange_sku?: string | null;
  items: RequestedItem[];
};

/** Gathers facts from Medusa + fulfillment, applies the policy, creates the RMA. */
export const requestReturnStep = wrapStep(
  "returns-request",
  async (input: RequestReturnWorkflowInput, c) => {
    const query = c.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "customer_id",
        "items.id",
        "items.quantity",
        "items.variant_sku",
        "items.variant.metadata",
        "items.variant.product.metadata",
      ],
      filters: {
        id: input.order_id,
        ...(input.customer_id ? { customer_id: input.customer_id } : {}),
      },
    });
    const order = data[0];
    if (!order) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Order not found"
      );
    }
    const purchased: Record<string, number> = {};
    const finalSale: string[] = [];
    const skuByLine = new Map<string, string>();
    for (const item of order.items ?? []) {
      purchased[item.id] = Number(item.quantity);
      if (item.variant_sku) {
        skuByLine.set(item.id, item.variant_sku);
      }
      const flag =
        item.variant?.metadata?.final_sale ??
        item.variant?.product?.metadata?.final_sale;
      if ((flag === true || flag === "true") && item.variant_sku) {
        finalSale.push(item.variant_sku);
      }
    }
    // The SKU decides final-sale policy and where returned stock is posted, so
    // it comes from the order line, never from the request.
    const trustedItems: RequestedItem[] = input.items.map((item) => {
      const sku = skuByLine.get(item.order_line_id);
      if (!sku) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          `Order line ${item.order_line_id} is not part of this order or has no SKU`
        );
      }
      return { ...item, sku };
    });
    if (input.exchange_sku) {
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku"],
        filters: { sku: input.exchange_sku },
      });
      if (variants.length === 0) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          `Exchange SKU ${input.exchange_sku} does not exist`
        );
      }
    }
    const shipments = await c
      .resolve<FulfillmentModuleService>(FASHION_FULFILLMENT_MODULE)
      .shipmentsForOrder(input.order_id);
    const deliveredAt =
      shipments
        .filter((s) => !s.return_id && s.delivered_at)
        .map((s) => new Date(s.delivered_at as Date))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const eligibility = evaluateReturnEligibility(
      {
        now: new Date(),
        window_days: Number(
          process.env.RETURN_WINDOW_DAYS ?? DEFAULT_RETURN_WINDOW_DAYS
        ),
        delivered_at: deliveredAt,
        purchased,
        already_returned: await rma(c).alreadyReturned(input.order_id),
        final_sale_skus: finalSale,
      },
      trustedItems
    );
    return await rma(c).requestReturn({
      ...input,
      items: trustedItems,
      customer_id: order.customer_id ?? input.customer_id ?? null,
      eligibility,
    });
  }
);

export const authorizeReturnStep = wrapStep(
  "returns-authorize",
  (i: Actor & { return_id: string; override_reason?: string | null }, c) =>
    rma(c).authorizeReturn(i)
);
export const rejectReturnStep = wrapStep(
  "returns-reject",
  (i: Actor & { return_id: string; reason: string }, c) =>
    rma(c).rejectReturn(i)
);
export const receiveReturnStep = wrapStep(
  "returns-receive",
  (i: Actor & { return_id: string }, c) => rma(c).receiveReturn(i)
);
export const closeReturnStep = wrapStep(
  "returns-close",
  (i: Actor & { return_id: string }, c) => rma(c).closeReturn(i)
);

/**
 * Creates the carrier return shipment (FR-RET-002). Carrier trouble is
 * returned as state, never thrown: the RMA stays AUTHORIZED and the shipment
 * retry job completes it.
 */
export const createReturnShipmentStep = wrapStep(
  "returns-create-return-shipment",
  async (
    i: Actor & {
      return_id: string;
      pickup_address: {
        name: string;
        phone: string;
        address_line: string;
        district?: string | null;
        province?: string | null;
      };
    },
    c
  ) => {
    if (!isEnabled("JT_FULFILLMENT_ENABLED")) {
      return { skipped: true as const, reason: "JT_FULFILLMENT_DISABLED" };
    }
    const [authorization] = await rma(c).listReturnAuthorizations({
      id: i.return_id,
    });
    const items = await rma(c).listReturnItems({ return_id: i.return_id });
    const provider = getCarrierProvider(DEFAULT_CARRIER);
    const shipment = await createCarrierShipment(
      c.resolve<FulfillmentModuleService>(FASHION_FULFILLMENT_MODULE),
      provider,
      {
        actor_id: i.actor_id,
        correlation_id: i.correlation_id,
        order_id: authorization.order_id,
        return_id: i.return_id,
        request: {
          merchant_reference: `R-${i.return_id}`,
          sender: { ...i.pickup_address, country: "VN" },
          receiver: senderFromEnv(),
          parcel: {
            weight_grams:
              Math.max(
                1,
                items.reduce((s, it) => s + Number(it.qty), 0)
              ) * 300,
            declared_value: 0,
            items: items.map((it) => ({
              name: it.sku,
              qty: Number(it.qty),
              sku: it.sku,
            })),
          },
          cod_amount: 0,
          notes: `Return ${authorization.rma_no}`,
        },
      }
    );
    if (
      shipment.create_state === "SUCCEEDED" &&
      authorization.status === "AUTHORIZED"
    ) {
      await rma(c).attachReturnShipment({ ...i, shipment_id: shipment.id });
    }
    return {
      skipped: false as const,
      shipment_id: shipment.id,
      create_state: shipment.create_state,
    };
  }
);

/** Exchange: reserve the replacement SKU outside general availability. */
export const reserveExchangeStep = wrapStep(
  "returns-reserve-exchange",
  async (i: Cmd & { return_id: string; location_id: string }, c) => {
    const [authorization] = await rma(c).listReturnAuthorizations({
      id: i.return_id,
    });
    if (authorization.type !== "EXCHANGE" || !authorization.exchange_sku) {
      return { skipped: true as const };
    }
    const items = await rma(c).listReturnItems({ return_id: i.return_id });
    const qty = items.reduce((sum, it) => sum + Number(it.qty), 0);
    const result = await c
      .resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE)
      .allocateToOrder({
        actor_id: i.actor_id,
        correlation_id: i.correlation_id,
        idempotency_key: `${i.idempotency_key}:exchange`,
        order_id: authorization.order_id,
        sku: authorization.exchange_sku,
        location_id: i.location_id,
        qty,
      });
    return { skipped: false as const, ...result };
  }
);

/**
 * Return QC + stock posting. Safe to retry at any point: if the disposition
 * was already stored but the stock posting failed, the retry resumes the
 * posting. Only the disposition decides where stock may go (BR-006).
 */
export const inspectAndPostStep = wrapStep(
  "returns-inspect-and-post",
  async (i: InspectItemInput, c) => {
    const fg = c.resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE);
    let isCommerce = false;
    if (i.destination_location_id) {
      isCommerce = (await fg.retrieveFgLocation(i.destination_location_id))
        .is_commerce;
    }
    const result = await rma(c).inspectReturnItem({
      ...i,
      destination_is_commerce: isCommerce,
    });
    const [item] = await rma(c).listReturnItems({ id: i.return_item_id });
    if (
      item.disposition === "SCRAP" ||
      item.stock_posted ||
      !item.destination_location_id
    ) {
      return {
        return_item_id: item.id,
        disposition: item.disposition,
        stock_posted: item.stock_posted,
      };
    }
    const [authorization] = await rma(c).listReturnAuthorizations({
      id: item.return_id,
    });
    await fg.receiveFinishedGoods({
      actor_id: i.actor_id,
      correlation_id: i.correlation_id,
      idempotency_key: `return-item:${item.id}`,
      sku: item.sku,
      qty: Number(item.qty),
      location_id: item.destination_location_id,
      source: "RETURN",
      return_item_id: item.id,
      traceability: {
        rma_id: authorization.id,
        rma_no: authorization.rma_no,
        disposition: item.disposition,
      },
    });
    await rma(c).markItemStockPosted(item.id);
    return {
      return_item_id: item.id,
      disposition: item.disposition,
      stock_posted: true,
      all_inspected:
        "all_inspected" in result ? result.all_inspected : undefined,
    };
  }
);

type RefundRequest = Actor & {
  return_id: string;
  payment_id: string;
  amount: number;
  note?: string | null;
};

/** Marker stored in the refund note so an unresolved refund can be found again. */
const refundMarker = (returnId: string) => `rma:${returnId}`;

/** Does the payment already carry a refund created for this RMA? */
const hasMarkedRefund = async (
  c: Resolver,
  paymentId: string,
  returnId: string
): Promise<boolean> => {
  const query = c.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "payment",
    fields: ["id", "refunds.id", "refunds.note"],
    filters: { id: paymentId },
  });
  const refunds: Array<{ note?: string | null }> = data[0]?.refunds ?? [];
  return refunds.some((r) => r.note?.startsWith(refundMarker(returnId)));
};

/**
 * Refund is executed by Medusa's payment workflow; we gate it and record the
 * outcome. The payment must belong to the RMA's order, the amount is capped by
 * the value of the returned pieces, and only one caller can win the
 * NONE/FAILED -> REQUESTED step. If an earlier attempt was left unresolved,
 * the payment is checked for a refund tagged with this RMA before refunding
 * again, so a crash can never lead to a second refund.
 */
export const refundReturnStep = wrapStep(
  "returns-refund",
  async (i: RefundRequest, c) => {
    const [authorization] = await rma(c).listReturnAuthorizations({
      id: i.return_id,
    });
    if (!authorization) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Return not found"
      );
    }
    const items = await rma(c).listReturnItems({ return_id: i.return_id });
    const query = c.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "items.id",
        "items.quantity",
        "items.total",
        "items.unit_price",
        "payment_collections.payments.id",
      ],
      filters: { id: authorization.order_id },
    });
    const order = data[0];
    const paymentIds: string[] = (order?.payment_collections ?? []).flatMap(
      (collection: { payments?: Array<{ id: string }> }) =>
        (collection.payments ?? []).map((p) => p.id)
    );
    if (!paymentIds.includes(i.payment_id)) {
      throw domainError(
        MedusaError.Types.INVALID_DATA,
        ErrorCodes.INVALID_STATE,
        "That payment does not belong to the order of this return"
      );
    }
    const lineById = new Map<
      string,
      { quantity: number; total: number; unit_price: number }
    >(
      (order?.items ?? []).map(
        (line: {
          id: string;
          quantity: number;
          total?: number;
          unit_price: number;
        }) => [
          line.id,
          {
            quantity: Number(line.quantity),
            total: Number(line.total ?? line.unit_price * line.quantity),
            unit_price: Number(line.unit_price),
          },
        ]
      )
    );
    const returned = returnedValue(
      items.map((item) => {
        const line = lineById.get(item.order_line_id);
        return {
          qty: Number(item.qty),
          // Per-piece value including tax and discounts when available.
          unit_total: line ? line.total / Math.max(1, line.quantity) : 0,
        };
      })
    );

    const requested = await rma(c).requestRefund({
      actor_id: i.actor_id,
      correlation_id: i.correlation_id,
      return_id: i.return_id,
      payment_id: i.payment_id,
      amount: i.amount,
      returned_value: returned,
    });
    if (requested.replay) {
      return requested;
    }
    if (
      requested.needs_reconcile &&
      (await hasMarkedRefund(c, i.payment_id, i.return_id))
    ) {
      return await rma(c).completeRefund({
        actor_id: i.actor_id,
        correlation_id: i.correlation_id,
        return_id: i.return_id,
        ok: true,
      });
    }
    try {
      await refundPaymentWorkflow(c as never).run({
        input: {
          payment_id: i.payment_id,
          created_by: i.actor_id,
          amount: i.amount,
          note: `${refundMarker(i.return_id)}${i.note ? ` ${i.note}` : ""}`,
        },
      });
    } catch (error) {
      // The provider may have refunded before failing: only mark FAILED when
      // no tagged refund exists, otherwise a retry would double refund.
      const refunded = await hasMarkedRefund(
        c,
        i.payment_id,
        i.return_id
      ).catch(() => false);
      await rma(c).completeRefund({
        actor_id: i.actor_id,
        correlation_id: i.correlation_id,
        return_id: i.return_id,
        ok: refunded,
        error: (error as Error).message,
      });
      if (!refunded) {
        throw error;
      }
      return { id: i.return_id, refund_status: "COMPLETED" };
    }
    return await rma(c).completeRefund({
      actor_id: i.actor_id,
      correlation_id: i.correlation_id,
      return_id: i.return_id,
      ok: true,
    });
  }
);
