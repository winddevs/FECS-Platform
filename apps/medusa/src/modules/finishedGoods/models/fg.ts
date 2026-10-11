import { model } from "@medusajs/framework/utils";

import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";

export const FG_OUTBOX_TABLE = "finished_goods_outbox_event";
export const FG_IDEMPOTENCY_TABLE = "finished_goods_idempotency_record";
export const FinishedGoodsOutboxEvent = defineOutboxEventModel(FG_OUTBOX_TABLE);
export const FinishedGoodsIdempotencyRecord =
  defineIdempotencyRecordModel(FG_IDEMPOTENCY_TABLE);

/** Where finished goods can be (requirement section 25). */
export const FG_LOCATION_KINDS = [
  "FACTORY",
  "FULFILLMENT",
  "IN_TRANSIT",
  "RETURN_QC",
  "QUARANTINE",
  "SHOWROOM",
] as const;
export type FgLocationKind = (typeof FG_LOCATION_KINDS)[number];

/**
 * Physical finished-goods locations. Only locations with `is_commerce = true`
 * feed the sellable projection; they map to a Medusa stock location.
 */
export const FgLocation = model
  .define("fg_location", {
    id: model.id({ prefix: "fgloc" }).primaryKey(),
    code: model.text(),
    name: model.text(),
    warehouse_code: model.text(),
    country_code: model.text().nullable(),
    kind: model.enum([...FG_LOCATION_KINDS]).default("FULFILLMENT"),
    is_commerce: model.boolean().default(true),
    medusa_stock_location_id: model.text().nullable(),
    is_active: model.boolean().default(true),
  })
  .indexes([
    {
      name: "IDX_fg_location_code_unique",
      on: ["code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    // The sellable projection writes one Medusa stock level per stock location.
    // Two FG locations mapped to the same one would overwrite each other's
    // quantity, and a fulfilment could not tell which one to ship from.
    {
      name: "IDX_fg_location_medusa_stock_location_unique",
      on: ["medusa_stock_location_id"],
      unique: true,
      where: "deleted_at IS NULL AND medusa_stock_location_id IS NOT NULL",
    },
  ]);

/** An FG receipt keeps full traceability back to the MO and packing (FR-FG-002). */
export const FgBatch = model
  .define("fg_batch", {
    id: model.id({ prefix: "fgb" }).primaryKey(),
    batch_no: model.text(),
    sku: model.text(),
    source: model
      .enum(["PRODUCTION", "RETURN", "TRANSFER"])
      .default("PRODUCTION"),
    /** Set on a batch created by a transfer: the batch the pieces came from. */
    parent_batch_id: model.text().nullable(),
    location_id: model.text(),
    qty: model.number(),
    /** Not yet shipped; consumed FIFO on shipment so orders trace to batches. */
    remaining_qty: model.number().default(0),
    mo_id: model.text().nullable(),
    production_batch_id: model.text().nullable(),
    packing_record_id: model.text().nullable(),
    return_item_id: model.text().nullable(),
    produced_at: model.dateTime(),
    traceability: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_fg_batch_no_unique",
      on: ["batch_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_fg_batch_packing_unique",
      on: ["packing_record_id"],
      unique: true,
      where: "deleted_at IS NULL AND packing_record_id IS NOT NULL",
    },
    { name: "IDX_fg_batch_sku", on: ["sku"] },
    { name: "IDX_fg_batch_mo", on: ["mo_id"] },
  ]);

/**
 * Physical stock per SKU + location. `version` increases on every mutation and
 * travels with the projection event so consumers can drop stale ones.
 * sellable = max(0, on_hand - warehouse_hold - qc_hold - allocated - safety_stock)
 */
export const FgBalance = model
  .define("fg_balance", {
    id: model.id({ prefix: "fgbal" }).primaryKey(),
    sku: model.text(),
    location_id: model.text(),
    on_hand: model.number().default(0),
    warehouse_hold: model.number().default(0),
    qc_hold: model.number().default(0),
    /** Allocated to specific orders (MTO): never part of general ATS (FR-FG-005). */
    allocated: model.number().default(0),
    safety_stock: model.number().default(0),
    version: model.number().default(0),
  })
  .indexes([
    {
      name: "IDX_fg_balance_sku_location_unique",
      on: ["sku", "location_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export const FG_MOVEMENT_TYPES = [
  "RECEIPT",
  "SHIP",
  "ADJUST_PLUS",
  "ADJUST_MINUS",
  "HOLD",
  "RELEASE_HOLD",
  "ALLOCATE",
  "DEALLOCATE",
  "TRANSFER_OUT",
  "TRANSFER_IN",
] as const;

/** Append-only physical FG ledger (FR-FG-003). */
export const FgMovement = model
  .define("fg_movement", {
    id: model.id({ prefix: "fgmov" }).primaryKey(),
    movement_type: model.enum([...FG_MOVEMENT_TYPES]),
    sku: model.text(),
    location_id: model.text(),
    balance_id: model.text(),
    batch_id: model.text().nullable(),
    qty: model.number(),
    on_hand_delta: model.number().default(0),
    warehouse_hold_delta: model.number().default(0),
    qc_hold_delta: model.number().default(0),
    allocated_delta: model.number().default(0),
    balance_version: model.number(),
    reference_type: model.text().nullable(),
    reference_id: model.text().nullable(),
    reason: model.text().nullable(),
    actor_id: model.text(),
    occurred_at: model.dateTime(),
  })
  .indexes([
    { name: "IDX_fg_movement_balance", on: ["balance_id"] },
    { name: "IDX_fg_movement_sku", on: ["sku", "occurred_at"] },
    {
      name: "IDX_fg_movement_reference",
      on: ["reference_type", "reference_id"],
    },
  ]);

/** Order-specific allocation (MTO output reserved for its customer order). */
export const FgAllocation = model
  .define("fg_allocation", {
    id: model.id({ prefix: "fgal" }).primaryKey(),
    order_id: model.text(),
    sku: model.text(),
    location_id: model.text(),
    qty: model.number(),
    shipped_qty: model.number().default(0),
    batch_id: model.text().nullable(),
    status: model
      .enum(["ALLOCATED", "SHIPPED", "RELEASED"])
      .default("ALLOCATED"),
  })
  .indexes([
    { name: "IDX_fg_allocation_order", on: ["order_id"] },
    { name: "IDX_fg_allocation_sku", on: ["sku", "location_id"] },
  ]);

/**
 * Consumer-side state for the Medusa inventory projection. The version guard
 * (FR-FG-006) lives here: events with version <= last_applied_version are
 * ignored so a stale Kafka/event retry can never roll stock back.
 */
export const CommerceSyncState = model
  .define("commerce_sync_state", {
    id: model.id({ prefix: "csync" }).primaryKey(),
    sku: model.text(),
    location_id: model.text(),
    last_applied_version: model.number().default(0),
    applied_available: model.number().default(0),
    status: model.enum(["OK", "UNMAPPED", "ERROR"]).default("OK"),
    last_error: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_commerce_sync_state_unique",
      on: ["sku", "location_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

/** Which FG batches physically fed which shipment/order (order -> batch -> MO). */
export const FgShipmentLine = model
  .define("fg_shipment_line", {
    id: model.id({ prefix: "fgsl" }).primaryKey(),
    reference_type: model.text(),
    reference_id: model.text(),
    order_id: model.text().nullable(),
    sku: model.text(),
    batch_id: model.text().nullable(),
    qty: model.number(),
  })
  .indexes([
    {
      name: "IDX_fg_shipment_line_reference",
      on: ["reference_type", "reference_id"],
    },
    { name: "IDX_fg_shipment_line_order", on: ["order_id"] },
    { name: "IDX_fg_shipment_line_batch", on: ["batch_id"] },
  ]);

export const FG_TRANSFER_STATUSES = [
  "IN_TRANSIT",
  "RECEIVED",
  "CANCELLED",
] as const;

/**
 * Stock moving between FG locations (section 25: "transfer rules must
 * preserve total stock"). Dispatch moves the pieces to an IN_TRANSIT
 * location; receipt moves them on; both are ledger movements, so the total
 * over all locations never changes.
 */
export const FgTransfer = model
  .define("fg_transfer", {
    id: model.id({ prefix: "fgx" }).primaryKey(),
    transfer_no: model.text(),
    status: model.enum([...FG_TRANSFER_STATUSES]).default("IN_TRANSIT"),
    sku: model.text(),
    qty: model.number(),
    from_location_id: model.text(),
    transit_location_id: model.text(),
    to_location_id: model.text(),
    dispatched_by: model.text(),
    dispatched_at: model.dateTime(),
    closed_by: model.text().nullable(),
    closed_at: model.dateTime().nullable(),
    notes: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_fg_transfer_no_unique",
      on: ["transfer_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_fg_transfer_status", on: ["status"] },
    { name: "IDX_fg_transfer_sku", on: ["sku"] },
  ]);
