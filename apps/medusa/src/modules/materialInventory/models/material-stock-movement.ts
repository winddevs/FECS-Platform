import { model } from "@medusajs/framework/utils";

export const MOVEMENT_TYPES = [
  "RECEIPT",
  "ISSUE_TO_PRODUCTION",
  "RETURN_FROM_PRODUCTION",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "SCRAP",
  "ADJUSTMENT_PLUS",
  "ADJUSTMENT_MINUS",
  "QC_RELEASE",
  "QC_REJECT",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * Immutable stock ledger (FR-INV-001). Each row records the signed effect on
 * the balance buckets, so `SUM(delta)` per balance must equal the balance row.
 * A DB trigger rejects UPDATE/DELETE (see migrations).
 */
export const MaterialStockMovement = model
  .define("material_stock_movement", {
    id: model.id({ prefix: "mmov" }).primaryKey(),
    movement_type: model.enum([...MOVEMENT_TYPES]),
    material_id: model.text(),
    lot_id: model.text().nullable(),
    roll_id: model.text().nullable(),
    location_id: model.text(),
    balance_id: model.text(),
    qty: model.bigNumber(),
    on_hand_delta: model.bigNumber().default(0),
    qc_hold_delta: model.bigNumber().default(0),
    damaged_delta: model.bigNumber().default(0),
    reference_type: model.text().nullable(),
    reference_id: model.text().nullable(),
    reason: model.text().nullable(),
    actor_id: model.text(),
    correlation_id: model.text().nullable(),
    idempotency_key: model.text().nullable(),
    occurred_at: model.dateTime(),
  })
  .indexes([
    { name: "IDX_material_movement_balance", on: ["balance_id"] },
    {
      name: "IDX_material_movement_material",
      on: ["material_id", "occurred_at"],
    },
    {
      name: "IDX_material_movement_reference",
      on: ["reference_type", "reference_id"],
    },
    { name: "IDX_material_movement_roll", on: ["roll_id"] },
  ]);
