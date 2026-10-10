import { randomUUID } from "node:crypto";

import { mapJtStatus } from "../jt/status-map";
import {
  CarrierError,
  type CarrierProvider,
  type CarrierTrackingEvent,
  type CreateShipmentRequest,
  type CreateShipmentResult,
} from "./provider";

export type SandboxFailure =
  | "NONE"
  /** Parcel is created, but the caller sees a timeout (the classic duplicate trap). */
  | "AMBIGUOUS_AFTER_CREATE"
  /** Nothing is created and the caller sees a timeout. */
  | "AMBIGUOUS_BEFORE_CREATE"
  | "RETRYABLE"
  | "FINAL";

type Parcel = {
  tracking_number: string;
  merchant_reference: string;
  cancelled: boolean;
  events: CarrierTrackingEvent[];
};

/**
 * In-process carrier used for local development, CI and the E2E suites. It
 * behaves like a real carrier, including failure modes.
 */
export class SandboxCarrierProvider implements CarrierProvider {
  readonly code: string;
  readonly parcels = new Map<string, Parcel>();
  failure: SandboxFailure = "NONE";
  createCalls = 0;

  constructor(code = "SANDBOX") {
    this.code = code;
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    this.createCalls += 1;
    const failure = this.failure;
    this.failure = "NONE";
    if (failure === "RETRYABLE") {
      throw new CarrierError("RETRYABLE", "carrier unavailable");
    }
    if (failure === "FINAL") {
      throw new CarrierError("FINAL", "invalid receiver address");
    }
    if (failure === "AMBIGUOUS_BEFORE_CREATE") {
      throw new CarrierError("AMBIGUOUS", "request timed out");
    }
    const existing = [...this.parcels.values()].find(
      (p) => p.merchant_reference === request.merchant_reference
    );
    if (existing) {
      return { tracking_number: existing.tracking_number };
    }
    const tracking = `SBX${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    this.parcels.set(tracking, {
      tracking_number: tracking,
      merchant_reference: request.merchant_reference,
      cancelled: false,
      events: [],
    });
    if (failure === "AMBIGUOUS_AFTER_CREATE") {
      throw new CarrierError("AMBIGUOUS", "request timed out");
    }
    return { tracking_number: tracking, carrier_order_id: `ord_${tracking}` };
  }

  async cancelShipment(trackingNumber: string): Promise<void> {
    const parcel = this.parcels.get(trackingNumber);
    if (!parcel) {
      throw new CarrierError("FINAL", "unknown parcel");
    }
    parcel.cancelled = true;
  }

  async getTracking(trackingNumber: string): Promise<CarrierTrackingEvent[]> {
    return this.parcels.get(trackingNumber)?.events ?? [];
  }

  async findByMerchantReference(
    ref: string
  ): Promise<CreateShipmentResult | null> {
    const parcel = [...this.parcels.values()].find(
      (p) => p.merchant_reference === ref
    );
    return parcel ? { tracking_number: parcel.tracking_number } : null;
  }

  /** Test helper: the carrier scans the parcel. */
  addEvent(
    trackingNumber: string,
    carrierStatus: string,
    at = new Date()
  ): void {
    this.parcels.get(trackingNumber)?.events.push({
      tracking_number: trackingNumber,
      carrier_status: carrierStatus,
      occurred_at: at,
    });
  }

  mapStatus(carrierStatus: string): string | null {
    return mapJtStatus(carrierStatus);
  }

  verifyWebhook(): boolean {
    return true;
  }

  parseWebhook(body: unknown): CarrierTrackingEvent[] {
    const payload = body as {
      tracking_number: string;
      status: string;
      at?: string;
    };
    return [
      {
        tracking_number: payload.tracking_number,
        carrier_status: payload.status,
        occurred_at: payload.at ? new Date(payload.at) : new Date(),
      },
    ];
  }
}
