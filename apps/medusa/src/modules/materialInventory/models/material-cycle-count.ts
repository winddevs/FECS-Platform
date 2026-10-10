import { model } from "@medusajs/framework/utils";

export const CYCLE_COUNT_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "NO_DIFFERENCE",
  "STALE",
] as const;
export type CycleCountStatus = (typeof CYCLE_COUNT_STATUSES)[number];

/**
 * A physical count waiting for a second person to approve it (FR-INV-011).
 * It keeps the expected quantity and balance version seen at count time, so
 * the adjustment is only posted if the book quantity is still what was
 * counted against.
 */
export const MaterialCycleCount = model
  .define("material_cycle_count", {
    id: model.id({ prefix: "mcc" }).primaryKey(),
    balance_id: model.text(),
    material_id: model.text(),
    expected_version: model.number(),
    expected_on_hand: model.bigNumber(),
    counted_qty: model.bigNumber(),
    /** counted - expected; negative when stock is missing. */
    diff_qty: model.bigNumber(),
    status: model.enum([...CYCLE_COUNT_STATUSES]).default("PENDING_APPROVAL"),
    reason: model.text(),
    counted_by: model.text(),
    decided_by: model.text().nullable(),
    decided_at: model.dateTime().nullable(),
    decision_reason: model.text().nullable(),
  })
  .indexes([
    { name: "IDX_material_cycle_count_balance", on: ["balance_id"] },
    { name: "IDX_material_cycle_count_status", on: ["status"] },
  ]);
