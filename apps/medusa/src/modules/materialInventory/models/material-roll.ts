import { model } from "@medusajs/framework/utils";

export const ROLL_STATUSES = ["ACTIVE", "DEPLETED", "DAMAGED"] as const;
export type RollStatus = (typeof ROLL_STATUSES)[number];

/** Individually tracked fabric roll; `roll_code` is the barcode/QR payload. */
export const MaterialRoll = model
  .define("material_roll", {
    id: model.id({ prefix: "mroll" }).primaryKey(),
    roll_code: model.text(),
    material_id: model.text(),
    lot_id: model.text(),
    initial_qty: model.bigNumber(),
    width_cm: model.number().nullable(),
    status: model.enum([...ROLL_STATUSES]).default("ACTIVE"),
  })
  .indexes([
    {
      name: "IDX_material_roll_code_unique",
      on: ["roll_code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_material_roll_lot", on: ["lot_id"] },
    { name: "IDX_material_roll_material", on: ["material_id"] },
  ]);
