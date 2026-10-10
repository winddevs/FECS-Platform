import { model } from "@medusajs/framework/utils";

export const MO_TYPES = [
  "MTS",
  "MTO",
  "REPLENISHMENT",
  "SAMPLE",
  "REWORK",
] as const;

export const MO_STATUSES = [
  "DRAFT",
  "PLANNED",
  "MATERIAL_CHECK",
  "MATERIAL_RESERVED",
  "RELEASED",
  "IN_PROGRESS",
  "QC_PENDING",
  "PACKING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "ON_HOLD",
  "CANCELLED",
  "FAILED",
] as const;

export type MoStatus = (typeof MO_STATUSES)[number];
export type MoType = (typeof MO_TYPES)[number];

export const MATERIAL_STATUSES = [
  "UNKNOWN",
  "READY",
  "PARTIAL",
  "SHORTAGE",
] as const;

/** BOM/routing versions are frozen on the MO at creation (FR-MFG-002). */
export const ManufacturingOrder = model
  .define("manufacturing_order", {
    id: model.id({ prefix: "mo" }).primaryKey(),
    mo_number: model.text(),
    order_type: model.enum([...MO_TYPES]).default("MTS"),
    status: model.enum([...MO_STATUSES]).default("DRAFT"),
    held_from_status: model.text().nullable(),
    product_sku: model.text(),
    /** [{ sku, qty }] finished variants to produce. */
    lines: model.json(),
    planned_qty: model.number(),
    /** Packed (QC-released) units. */
    completed_qty: model.number().default(0),
    bom_id: model.text(),
    bom_version: model.number(),
    routing_id: model.text(),
    routing_version: model.number(),
    material_status: model.enum([...MATERIAL_STATUSES]).default("UNKNOWN"),
    customer_order_id: model.text().nullable(),
    /** REWORK orders point at the order whose defective output they repair. */
    source_mo_id: model.text().nullable(),
    /** Closed below the planned quantity on purpose (FR-MFG-014). */
    short_closed: model.boolean().default(false),
    short_close_reason: model.text().nullable(),
    due_date: model.dateTime().nullable(),
    notes: model.text().nullable(),
    created_by: model.text(),
  })
  .indexes([
    {
      name: "IDX_mo_number_unique",
      on: ["mo_number"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_mo_status", on: ["status"] },
    { name: "IDX_mo_customer_order", on: ["customer_order_id"] },
    { name: "IDX_mo_product_sku", on: ["product_sku"] },
  ]);

export const MoMaterialRequirement = model
  .define("mo_material_requirement", {
    id: model.id({ prefix: "moreq" }).primaryKey(),
    mo_id: model.text(),
    material_id: model.text(),
    uom: model.text(),
    required_qty: model.bigNumber(),
    reserved_qty: model.bigNumber().default(0),
    issued_qty: model.bigNumber().default(0),
    /** Inventory reservation backing this requirement. */
    reservation_id: model.text().nullable(),
    availability_status: model
      .enum(["UNKNOWN", "READY", "SHORTAGE"])
      .default("UNKNOWN"),
  })
  .indexes([
    {
      name: "IDX_mo_requirement_unique",
      on: ["mo_id", "material_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export const ProductionBatch = model
  .define("production_batch", {
    id: model.id({ prefix: "pbat" }).primaryKey(),
    mo_id: model.text(),
    batch_no: model.text(),
    planned_qty: model.number(),
    status: model.enum(["OPEN", "CUT", "CLOSED"]).default("OPEN"),
  })
  .indexes([
    {
      name: "IDX_production_batch_no_unique",
      on: ["batch_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_production_batch_mo", on: ["mo_id"] },
  ]);

export const REQUEST_STATUSES = [
  "REQUESTED",
  "WAITING_MATERIAL",
  "MO_CREATED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;

/**
 * A made-to-order customer order line waiting to become production (FR-COM-006,
 * TDD s.23). Unique per order line, so a replayed `order.placed` event can
 * never create duplicate production.
 */
export const ProductionRequest = model
  .define("production_request", {
    id: model.id({ prefix: "preq" }).primaryKey(),
    order_id: model.text(),
    order_line_id: model.text(),
    sku: model.text(),
    product_sku: model.text(),
    qty: model.number(),
    status: model.enum([...REQUEST_STATUSES]).default("REQUESTED"),
    payment_confirmed: model.boolean().default(false),
    mo_id: model.text().nullable(),
    attempts: model.number().default(0),
    next_attempt_at: model.dateTime().nullable(),
    last_error: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_production_request_line_unique",
      on: ["order_line_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_production_request_order", on: ["order_id"] },
    {
      name: "IDX_production_request_status",
      on: ["status", "next_attempt_at"],
    },
  ]);
