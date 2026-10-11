import { model } from "@medusajs/framework/utils";

import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";

export const RETURNS_OUTBOX_TABLE = "returns_outbox_event";
export const RETURNS_IDEMPOTENCY_TABLE = "returns_idempotency_record";
export const ReturnsOutboxEvent = defineOutboxEventModel(RETURNS_OUTBOX_TABLE);
export const ReturnsIdempotencyRecord = defineIdempotencyRecordModel(
  RETURNS_IDEMPOTENCY_TABLE
);

export const RETURN_STATUSES = [
  "REQUESTED",
  "AUTHORIZED",
  "REJECTED",
  "IN_TRANSIT",
  "RECEIVED",
  "INSPECTED",
  "CLOSED",
  "CANCELLED",
] as const;

export const DISPOSITIONS = [
  "PENDING",
  "A_GRADE",
  "B_GRADE",
  "REWORK",
  "DAMAGED",
  "SCRAP",
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export type Disposition = (typeof DISPOSITIONS)[number];

export const ReturnAuthorization = model
  .define("return_authorization", {
    id: model.id({ prefix: "rma" }).primaryKey(),
    rma_no: model.text(),
    order_id: model.text(),
    customer_id: model.text().nullable(),
    type: model.enum(["RETURN", "EXCHANGE"]).default("RETURN"),
    status: model.enum([...RETURN_STATUSES]).default("REQUESTED"),
    reason: model.text(),
    /** { eligible, reasons[] } captured at request time (audit). */
    eligibility: model.json(),
    override_reason: model.text().nullable(),
    authorized_by: model.text().nullable(),
    return_shipment_id: model.text().nullable(),
    exchange_sku: model.text().nullable(),
    /** Replacement parcel sent to the customer once the return arrived. */
    replacement_shipment_id: model.text().nullable(),
    replacement_shipped_at: model.dateTime().nullable(),
    refund_status: model
      .enum(["NONE", "REQUESTED", "COMPLETED", "FAILED"])
      .default("NONE"),
    refund_payment_id: model.text().nullable(),
    refund_amount: model.bigNumber().nullable(),
    created_by: model.text(),
  })
  .indexes([
    {
      name: "IDX_return_authorization_no_unique",
      on: ["rma_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_return_authorization_order", on: ["order_id"] },
    { name: "IDX_return_authorization_status", on: ["status"] },
  ]);

export const ReturnItem = model
  .define("rma_item", {
    id: model.id({ prefix: "rmai" }).primaryKey(),
    return_id: model.text(),
    order_line_id: model.text(),
    sku: model.text(),
    qty: model.number(),
    disposition: model.enum([...DISPOSITIONS]).default("PENDING"),
    destination_location_id: model.text().nullable(),
    inspected_by: model.text().nullable(),
    inspected_at: model.dateTime().nullable(),
    inspection_notes: model.text().nullable(),
    /** True once the item was posted to finished goods (A-grade/B-grade/...). */
    stock_posted: model.boolean().default(false),
  })
  .indexes([
    { name: "IDX_rma_item_return", on: ["return_id"] },
    { name: "IDX_rma_item_order_line", on: ["order_line_id"] },
  ]);
