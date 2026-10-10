import { model } from "@medusajs/framework/utils";

import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";

export const MANUFACTURING_OUTBOX_TABLE = "manufacturing_outbox_event";
export const MANUFACTURING_IDEMPOTENCY_TABLE =
  "manufacturing_idempotency_record";

export const ManufacturingOutboxEvent = defineOutboxEventModel(
  MANUFACTURING_OUTBOX_TABLE
);
export const ManufacturingIdempotencyRecord = defineIdempotencyRecordModel(
  MANUFACTURING_IDEMPOTENCY_TABLE
);

export const SUGGESTION_TYPES = [
  "PURCHASE",
  "TRANSFER",
  "PRODUCE",
  "RESCHEDULE",
] as const;

export const MaterialPlanningParam = model
  .define("material_planning_param", {
    id: model.id({ prefix: "mpp" }).primaryKey(),
    material_id: model.text(),
    safety_stock: model.bigNumber().default(0),
    lead_time_days: model.number().default(0),
  })
  .indexes([
    {
      name: "IDX_material_planning_param_unique",
      on: ["material_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

/** MRP runs are versioned and auditable (TDD section 13). */
export const MrpRun = model.define("mrp_run", {
  id: model.id({ prefix: "mrp" }).primaryKey(),
  run_no: model.text(),
  status: model.enum(["COMPLETED", "FAILED"]).default("COMPLETED"),
  parameters: model.json().nullable(),
  summary: model.json().nullable(),
  created_by: model.text(),
});

/** Recommendations only: v1 never creates supplier POs automatically. */
export const MrpSuggestion = model
  .define("mrp_suggestion", {
    id: model.id({ prefix: "mrps" }).primaryKey(),
    run_id: model.text(),
    type: model.enum([...SUGGESTION_TYPES]),
    material_id: model.text(),
    gross_requirement: model.bigNumber(),
    available: model.bigNumber(),
    confirmed_incoming: model.bigNumber(),
    safety_buffer: model.bigNumber(),
    net_requirement: model.bigNumber(),
    suggested_qty: model.bigNumber(),
    status: model.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
    decided_by: model.text().nullable(),
    mo_ids: model.json().nullable(),
  })
  .indexes([{ name: "IDX_mrp_suggestion_run", on: ["run_id"] }]);
