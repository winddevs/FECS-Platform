import { model } from "@medusajs/framework/utils";

import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";
import { CREATE_STATES, SHIPMENT_STATUSES } from "../lib/shipment-state";

export const FULFILLMENT_OUTBOX_TABLE = "fulfillment_outbox_event";
export const FULFILLMENT_IDEMPOTENCY_TABLE = "fulfillment_idempotency_record";
export const FulfillmentOutboxEvent = defineOutboxEventModel(
  FULFILLMENT_OUTBOX_TABLE
);
export const FulfillmentIdempotencyRecord = defineIdempotencyRecordModel(
  FULFILLMENT_IDEMPOTENCY_TABLE
);

/**
 * Local carrier shipment. Hard invariant (TDD s.29): one Medusa fulfillment
 * can have at most one shipment per carrier - enforced by a unique index, not
 * only by code.
 */
export const CarrierShipment = model
  .define("carrier_shipment", {
    id: model.id({ prefix: "shp" }).primaryKey(),
    carrier_code: model.text(),
    /** Set for outbound shipments. */
    medusa_fulfillment_id: model.text().nullable(),
    /** Set for return shipments. */
    return_id: model.text().nullable(),
    /** Set for the replacement parcel sent out for an exchange (the RMA id). */
    exchange_return_id: model.text().nullable(),
    /**
     * Set when a replacement shipment took over (FR-FUL-003: one shipment per
     * fulfillment "unless explicitly replaced"). Superseded rows stay for the
     * audit trail but no longer hold the uniqueness slot.
     */
    superseded_at: model.dateTime().nullable(),
    superseded_by_id: model.text().nullable(),
    order_id: model.text(),
    merchant_reference: model.text(),
    create_state: model.enum([...CREATE_STATES]).default("PENDING"),
    status: model.enum([...SHIPMENT_STATUSES]).default("CREATED"),
    tracking_number: model.text().nullable(),
    carrier_order_id: model.text().nullable(),
    /** Request kept so retries/reconciliation can resend exactly the same data. */
    request: model.json(),
    attempts: model.number().default(0),
    last_error: model.text().nullable(),
    last_event_at: model.dateTime().nullable(),
    last_polled_at: model.dateTime().nullable(),
    delivered_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_carrier_shipment_fulfillment_unique",
      on: ["carrier_code", "medusa_fulfillment_id"],
      unique: true,
      where:
        "deleted_at IS NULL AND medusa_fulfillment_id IS NOT NULL AND superseded_at IS NULL",
    },
    {
      name: "IDX_carrier_shipment_exchange_unique",
      on: ["carrier_code", "exchange_return_id"],
      unique: true,
      where:
        "deleted_at IS NULL AND exchange_return_id IS NOT NULL AND superseded_at IS NULL",
    },
    {
      name: "IDX_carrier_shipment_return_unique",
      on: ["carrier_code", "return_id"],
      unique: true,
      where:
        "deleted_at IS NULL AND return_id IS NOT NULL AND superseded_at IS NULL",
    },
    {
      name: "IDX_carrier_shipment_merchant_ref_unique",
      on: ["merchant_reference"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_carrier_shipment_tracking",
      on: ["carrier_code", "tracking_number"],
    },
    { name: "IDX_carrier_shipment_order", on: ["order_id"] },
    { name: "IDX_carrier_shipment_status", on: ["status", "last_event_at"] },
  ]);

/** Every carrier event, applied or not; unique per shipment+event hash. */
export const TrackingEvent = model
  .define("tracking_event", {
    id: model.id({ prefix: "trk" }).primaryKey(),
    shipment_id: model.text(),
    event_hash: model.text(),
    carrier_status: model.text(),
    description: model.text().nullable(),
    canonical_status: model.text().nullable(),
    outcome: model.enum(["APPLIED", "IGNORED"]),
    ignored_reason: model.text().nullable(),
    occurred_at: model.dateTime(),
  })
  .indexes([
    {
      name: "IDX_tracking_event_unique",
      on: ["shipment_id", "event_hash"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_tracking_event_shipment", on: ["shipment_id", "occurred_at"] },
  ]);

export const EXCEPTION_TYPES = [
  "DELIVERY_FAILED",
  "RETURNED_TO_SENDER",
  "CARRIER_EXCEPTION",
] as const;
export const EXCEPTION_RESOLUTIONS = [
  "REDELIVER",
  "REFUND",
  "RESTOCK",
  "CLOSE",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];
export type ExceptionResolution = (typeof EXCEPTION_RESOLUTIONS)[number];

/**
 * Work item for customer support when a parcel could not be delivered
 * (FR-FUL-008): one open exception per shipment and kind, closed by a person
 * with a resolution, or automatically when the parcel is delivered after all.
 */
export const ShipmentException = model
  .define("shipment_exception", {
    id: model.id({ prefix: "shex" }).primaryKey(),
    shipment_id: model.text(),
    order_id: model.text(),
    type: model.enum([...EXCEPTION_TYPES]),
    status: model.enum(["OPEN", "RESOLVED"]).default("OPEN"),
    detail: model.json().nullable(),
    resolution: model.enum([...EXCEPTION_RESOLUTIONS]).nullable(),
    resolution_note: model.text().nullable(),
    resolved_by: model.text().nullable(),
    resolved_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_shipment_exception_open_unique",
      on: ["shipment_id", "type"],
      unique: true,
      where: "deleted_at IS NULL AND status = 'OPEN'",
    },
    { name: "IDX_shipment_exception_status", on: ["status", "type"] },
    { name: "IDX_shipment_exception_order", on: ["order_id"] },
  ]);
