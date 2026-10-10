import { model } from "@medusajs/framework/utils";

import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";

export const QUALITY_OUTBOX_TABLE = "quality_outbox_event";
export const QUALITY_IDEMPOTENCY_TABLE = "quality_idempotency_record";

export const QualityOutboxEvent = defineOutboxEventModel(QUALITY_OUTBOX_TABLE);
export const QualityIdempotencyRecord = defineIdempotencyRecordModel(
  QUALITY_IDEMPOTENCY_TABLE
);

export const INSPECTION_TARGETS = ["BUNDLE", "GOODS_RECEIPT_LINE"] as const;

/**
 * QC is its own domain (TDD section 18). Manufacturing consumes the
 * `quality.inspection_completed` decision; only PASS quantity may progress.
 * Invariant (DB CHECK): pass + rework + reject + hold = inspected.
 */
export const QualityInspection = model
  .define("quality_inspection", {
    id: model.id({ prefix: "qins" }).primaryKey(),
    inspection_no: model.text(),
    target_type: model.enum([...INSPECTION_TARGETS]),
    target_id: model.text(),
    reference_type: model.text().nullable(),
    reference_id: model.text().nullable(),
    qty_inspected: model.bigNumber(),
    pass_qty: model.bigNumber().default(0),
    rework_qty: model.bigNumber().default(0),
    reject_qty: model.bigNumber().default(0),
    hold_qty: model.bigNumber().default(0),
    defects: model.json().nullable(),
    notes: model.text().nullable(),
    inspector_id: model.text(),
  })
  .indexes([
    {
      name: "IDX_quality_inspection_no_unique",
      on: ["inspection_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_quality_inspection_target", on: ["target_type", "target_id"] },
    {
      name: "IDX_quality_inspection_reference",
      on: ["reference_type", "reference_id"],
    },
  ]);
