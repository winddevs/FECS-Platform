import { createHmac, timingSafeEqual } from "node:crypto";

import {
  CarrierError,
  type CarrierParty,
  type CarrierProvider,
  type CarrierTrackingEvent,
  type CreateShipmentRequest,
  type CreateShipmentResult,
} from "../carrier/provider";
import { mapJtStatus } from "./status-map";

export type JtConfig = {
  baseUrl: string;
  apiAccount: string;
  privateKey: string;
  webhookSecret: string;
  signatureHeader: string;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_CAUSE_DEPTH = 5;

/** Finds an errno-style code in fetch's nested cause / AggregateError chain. */
const networkErrorCode = (error: unknown, depth = 0): string | undefined => {
  if (!error || typeof error !== "object" || depth > MAX_CAUSE_DEPTH) {
    return undefined;
  }
  const candidate = error as {
    code?: unknown;
    cause?: unknown;
    errors?: unknown[];
  };
  if (typeof candidate.code === "string") {
    return candidate.code;
  }
  for (const nested of [candidate.cause, ...(candidate.errors ?? [])]) {
    const found = networkErrorCode(nested, depth + 1);
    if (found) {
      return found;
    }
  }
  return undefined;
};
const SIGNATURE_HEADER = "x-signature";
const HAS_TIME_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const VIETNAM_OFFSET = "+07:00";

/**
 * Parses a carrier scan time. A time without a zone is Vietnam local time, not
 * the server's. A missing or unparseable time yields null: the event is
 * dropped rather than stamped "now", which would create a new duplicate event
 * on every poll and break the ordering.
 */
export const parseScanTime = (value: unknown): Date | null => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const text = value.trim().replace(" ", "T");
  const parsed = new Date(
    HAS_TIME_ZONE.test(text) ? text : `${text}${VIETNAM_OFFSET}`
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Keeps only details that have a usable time. */
const withScanTime = <T extends { scanTime?: string }>(
  details: T[]
): Array<{ detail: T; at: Date }> =>
  details.flatMap((detail) => {
    const at = parseScanTime(detail.scanTime);
    return at ? [{ detail, at }] : [];
  });

/**
 * J&T adapter. All vendor-specific shapes live here and nowhere else.
 *
 * NOTE: J&T publishes its API contract only after a commercial agreement.
 * This adapter implements a signed JSON contract (HMAC-SHA256 over
 * `${timestamp}.${body}`) with the endpoints below. When J&T provides the
 * official field names/signature scheme for your account, adjust ONLY the
 * `toWire*` / `fromWire*` helpers and `sign()` in this file.
 */
export class JTCarrierProvider implements CarrierProvider {
  readonly code = "JT";

  constructor(private readonly config: JtConfig) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): JTCarrierProvider {
    const required = [
      "JT_API_BASE_URL",
      "JT_API_ACCOUNT",
      "JT_PRIVATE_KEY",
    ] as const;
    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing J&T configuration: ${missing.join(", ")}`);
    }
    return new JTCarrierProvider({
      baseUrl: (env.JT_API_BASE_URL as string).replace(/\/$/, ""),
      apiAccount: env.JT_API_ACCOUNT as string,
      privateKey: env.JT_PRIVATE_KEY as string,
      webhookSecret: env.JT_WEBHOOK_SECRET ?? "",
      signatureHeader: (
        env.JT_SIGNATURE_HEADER ?? SIGNATURE_HEADER
      ).toLowerCase(),
      timeoutMs: Number(env.JT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    });
  }

  private sign(timestamp: string, body: string): string {
    return createHmac("sha256", this.config.privateKey)
      .update(`${timestamp}.${body}`)
      .digest("hex");
  }

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    payload?: Record<string, unknown>
  ): Promise<T> {
    const body = payload ? JSON.stringify(payload) : "";
    const timestamp = String(Date.now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-api-account": this.config.apiAccount,
          "x-timestamp": timestamp,
          "x-signature": this.sign(timestamp, body),
        },
        body: method === "POST" ? body : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      // Aborted/reset after the request may have been sent => ambiguous.
      // Connection refused / DNS failure => nothing was sent => retryable.
      const code = networkErrorCode(error);
      const neverSent = code === "ECONNREFUSED" || code === "ENOTFOUND";
      throw new CarrierError(
        neverSent ? "RETRYABLE" : "AMBIGUOUS",
        `J&T request failed: ${code ?? (error as Error).name}`
      );
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (status === 429) {
      throw new CarrierError("RETRYABLE", "J&T rate limited", status);
    }
    // The request was refused before any parcel logic ran: safe to retry once
    // credentials are fixed.
    if (status === 401 || status === 403) {
      throw new CarrierError(
        "RETRYABLE",
        `J&T refused our credentials (${status})`,
        status
      );
    }
    // Timeouts and server errors: the carrier may or may not have acted.
    if (status === 408 || status === 425 || status >= 500) {
      throw new CarrierError("AMBIGUOUS", `J&T error ${status}`, status);
    }
    const json = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (status >= 400 || json.success === false) {
      throw new CarrierError(
        "FINAL",
        `J&T rejected request: ${String(json.message ?? status)}`,
        status
      );
    }
    return json as T;
  }

  private party(p: CarrierParty) {
    return {
      name: p.name,
      phone: p.phone,
      address: p.address_line,
      ward: p.ward ?? null,
      district: p.district ?? null,
      province: p.province ?? null,
      country: p.country ?? "VN",
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    const result = await this.call<{
      data?: { billCode?: string; orderId?: string };
    }>("POST", "/orders", {
      txlogisticId: request.merchant_reference,
      serviceType: request.service_code ?? null,
      sender: this.party(request.sender),
      receiver: this.party(request.receiver),
      weightGrams: request.parcel.weight_grams,
      declaredValue: request.parcel.declared_value,
      codAmount: request.cod_amount,
      items: request.parcel.items,
      remark: request.notes ?? null,
    });
    const tracking = result.data?.billCode;
    if (!tracking) {
      throw new CarrierError(
        "AMBIGUOUS",
        "J&T response did not include a tracking number"
      );
    }
    return {
      tracking_number: tracking,
      carrier_order_id: result.data?.orderId ?? null,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<void> {
    await this.call("POST", "/orders/cancel", { billCode: trackingNumber });
  }

  async getTracking(trackingNumber: string): Promise<CarrierTrackingEvent[]> {
    const result = await this.call<{
      data?: {
        details?: Array<{
          scanType?: string;
          desc?: string;
          scanTime?: string;
        }>;
      };
    }>("GET", `/tracking?billCode=${encodeURIComponent(trackingNumber)}`);
    return withScanTime(result.data?.details ?? []).map(
      ({ detail: d, at }) => ({
        tracking_number: trackingNumber,
        carrier_status: d.scanType ?? d.desc ?? "",
        description: d.desc ?? null,
        occurred_at: at,
        raw: d as Record<string, unknown>,
      })
    );
  }

  async findByMerchantReference(
    ref: string
  ): Promise<CreateShipmentResult | null> {
    try {
      const result = await this.call<{
        data?: { billCode?: string; orderId?: string };
      }>("GET", `/orders/query?txlogisticId=${encodeURIComponent(ref)}`);
      return result.data?.billCode
        ? {
            tracking_number: result.data.billCode,
            carrier_order_id: result.data.orderId ?? null,
          }
        : null;
    } catch (error) {
      // Only an explicit 404 proves the parcel was never created. Any other
      // failure (auth, validation, "system busy") says nothing about the
      // parcel, so it must stay unresolved instead of triggering a re-create.
      if (error instanceof CarrierError && error.httpStatus === 404) {
        return null;
      }
      throw error;
    }
  }

  mapStatus(carrierStatus: string): string | null {
    return mapJtStatus(carrierStatus);
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): boolean {
    if (!this.config.webhookSecret) {
      return false;
    }
    const supplied = headers[this.config.signatureHeader];
    const signature = Array.isArray(supplied) ? supplied[0] : supplied;
    if (!signature) {
      return false;
    }
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): CarrierTrackingEvent[] {
    const payload = body as {
      billCode?: string;
      details?: Array<{ scanType?: string; desc?: string; scanTime?: string }>;
    };
    if (!payload?.billCode) {
      return [];
    }
    return withScanTime(payload.details ?? []).map(({ detail: d, at }) => ({
      tracking_number: payload.billCode as string,
      carrier_status: d.scanType ?? d.desc ?? "",
      description: d.desc ?? null,
      occurred_at: at,
      raw: d as Record<string, unknown>,
    }));
  }
}
