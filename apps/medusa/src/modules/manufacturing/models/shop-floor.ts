import { model } from "@medusajs/framework/utils";

/** Planned fabric use per lay / roll / size ratio (FR-MFG-006). */
export const CutPlan = model
  .define("cut_plan", {
    id: model.id({ prefix: "cplan" }).primaryKey(),
    batch_id: model.text(),
    mo_id: model.text(),
    status: model.enum(["PLANNED", "CUT"]).default("PLANNED"),
    /** [{ roll_code, planned_consumption, size_ratio: { sku: qty } }] */
    lays: model.json(),
    planned_consumption: model.bigNumber(),
    fabric_material_id: model.text(),
    actual_consumption: model.bigNumber().nullable(),
  })
  .indexes([
    {
      name: "IDX_cut_plan_batch_unique",
      on: ["batch_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export const ManufacturingException = model
  .define("manufacturing_exception", {
    id: model.id({ prefix: "mexc" }).primaryKey(),
    mo_id: model.text(),
    type: model.text(),
    status: model.enum(["OPEN", "RESOLVED"]).default("OPEN"),
    detail: model.json(),
    resolved_by: model.text().nullable(),
  })
  .indexes([{ name: "IDX_mfg_exception_mo", on: ["mo_id", "status"] }]);

/**
 * Bundle-level WIP (TDD section 17).
 * Invariant (DB CHECK): waiting + buffer + rework + reject + qc_released
 *   + rework_out = qty, and packed <= qc_released.
 */
export const Bundle = model
  .define("bundle", {
    id: model.id({ prefix: "bnd" }).primaryKey(),
    bundle_code: model.text(),
    mo_id: model.text(),
    batch_id: model.text(),
    sku: model.text(),
    parent_bundle_id: model.text().nullable(),
    qty: model.number(),
    current_seq: model.number().default(1),
    waiting_qty: model.number().default(0),
    buffer_qty: model.number().default(0),
    rework_qty: model.number().default(0),
    reject_qty: model.number().default(0),
    rework_out_qty: model.number().default(0),
    qc_released_qty: model.number().default(0),
    packed_qty: model.number().default(0),
  })
  .indexes([
    {
      name: "IDX_bundle_code_unique",
      on: ["bundle_code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_bundle_mo", on: ["mo_id"] },
    { name: "IDX_bundle_batch", on: ["batch_id"] },
  ]);

/** Operator-reported operation result. DB CHECK: good + rework + reject <= input. */
export const OperationExecution = model
  .define("operation_execution", {
    id: model.id({ prefix: "opx" }).primaryKey(),
    bundle_id: model.text(),
    mo_id: model.text(),
    op_seq: model.number(),
    op_code: model.text(),
    work_center_id: model.text().nullable(),
    input_qty: model.number(),
    good_qty: model.number(),
    rework_qty: model.number().default(0),
    reject_qty: model.number().default(0),
    standard_minutes_total: model.bigNumber().default(0),
    actor_id: model.text(),
    idempotency_key: model.text(),
    occurred_at: model.dateTime(),
  })
  .indexes([
    { name: "IDX_op_execution_bundle", on: ["bundle_id"] },
    { name: "IDX_op_execution_wc", on: ["work_center_id", "occurred_at"] },
  ]);

export const PackingRecord = model
  .define("packing_record", {
    id: model.id({ prefix: "pack" }).primaryKey(),
    pack_no: model.text(),
    bundle_id: model.text(),
    mo_id: model.text(),
    batch_id: model.text(),
    sku: model.text(),
    qty: model.number(),
    packed_by: model.text(),
  })
  .indexes([
    {
      name: "IDX_packing_record_no_unique",
      on: ["pack_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_packing_record_mo", on: ["mo_id"] },
  ]);
