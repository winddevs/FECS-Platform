import { model } from "@medusajs/framework/utils";

/**
 * Current balance projection by material + lot + roll + location (ADR-004).
 * `available = on_hand - reserved - qc_hold - damaged`.
 * qc_hold and damaged are subsets of on_hand. Invariants are also enforced by
 * DB CHECK constraints (see migrations).
 */
export const MaterialBalance = model
  .define("material_balance", {
    id: model.id({ prefix: "mbal" }).primaryKey(),
    balance_key: model.text(),
    material_id: model.text(),
    lot_id: model.text().nullable(),
    roll_id: model.text().nullable(),
    location_id: model.text(),
    on_hand_qty: model.bigNumber().default(0),
    reserved_qty: model.bigNumber().default(0),
    qc_hold_qty: model.bigNumber().default(0),
    damaged_qty: model.bigNumber().default(0),
    version: model.number().default(1),
  })
  .indexes([
    {
      name: "IDX_material_balance_key_unique",
      on: ["balance_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_material_balance_material_location",
      on: ["material_id", "location_id"],
    },
    { name: "IDX_material_balance_roll", on: ["roll_id"] },
    { name: "IDX_material_balance_lot", on: ["lot_id"] },
  ]);
