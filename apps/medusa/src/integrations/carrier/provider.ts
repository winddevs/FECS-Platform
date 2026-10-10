/**
 * Carrier abstraction (ADR-005, FR-FUL-001). Order, fulfillment and
 * notification code depend only on this interface; J&T specifics stay in
 * `integrations/jt`.
 */
export type CarrierParty = {
  name: string;
  phone: string;
  address_line: string;
  ward?: string | null;
  district?: string | null;
  province?: string | null;
  country?: string | null;
};

export type CreateShipmentRequest = {
  /** Our unique reference; used to find the parcel again after a timeout. */
  merchant_reference: string;
  service_code?: string | null;
  sender: CarrierParty;
  receiver: CarrierParty;
  parcel: {
    weight_grams: number;
    declared_value: number;
    items: Array<{ name: string; qty: number; sku?: string | null }>;
  };
  cod_amount: number;
  notes?: string | null;
};

export type CreateShipmentResult = {
  tracking_number: string;
  carrier_order_id?: string | null;
};

export type CarrierTrackingEvent = {
  tracking_number: string;
  /** Raw carrier status code or text. */
  carrier_status: string;
  description?: string | null;
  occurred_at: Date;
  raw?: Record<string, unknown>;
};

/**
 * - RETRYABLE: the request definitely did not create anything (e.g. refused
 *   connection, 429). Safe to retry.
 * - AMBIGUOUS: the request may have been processed (timeout / 5xx after send).
 *   Reconcile by merchant reference BEFORE retrying (TDD section 30).
 * - FINAL: the carrier rejected the request; retrying will not help.
 */
export type CarrierErrorKind = "RETRYABLE" | "AMBIGUOUS" | "FINAL";

export class CarrierError extends Error {
  constructor(
    public readonly kind: CarrierErrorKind,
    message: string
  ) {
    super(message);
    this.name = "CarrierError";
  }
}

export interface CarrierProvider {
  readonly code: string;
  createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult>;
  cancelShipment(trackingNumber: string): Promise<void>;
  getTracking(trackingNumber: string): Promise<CarrierTrackingEvent[]>;
  /** Used to resolve UNKNOWN create outcomes without creating a duplicate. */
  findByMerchantReference(
    merchantReference: string
  ): Promise<CreateShipmentResult | null>;
  /** Maps a raw carrier status to a canonical shipment status (or null). */
  mapStatus(carrierStatus: string): string | null;
  verifyWebhook?(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): boolean;
  parseWebhook?(body: unknown): CarrierTrackingEvent[];
}
