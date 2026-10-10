import { model } from "@medusajs/framework/utils";

export const MATERIAL_TYPES = ["FABRIC", "TRIM", "PACKAGING", "OTHER"] as const;
export const ALLOCATION_POLICIES = ["FIFO", "SAME_DYE_LOT_FIFO"] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type AllocationPolicy = (typeof ALLOCATION_POLICIES)[number];

/** Raw material master. Never exposed as Medusa sellable inventory (BR-002). */
export const Material = model
  .define("material", {
    id: model.id({ prefix: "mat" }).primaryKey(),
    code: model.text(),
    name: model.text(),
    material_type: model.enum([...MATERIAL_TYPES]).default("FABRIC"),
    uom: model.text(),
    track_lot: model.boolean().default(true),
    track_roll: model.boolean().default(false),
    track_dye_lot: model.boolean().default(false),
    max_dye_lots: model.number().default(1),
    allocation_policy: model
      .enum([...ALLOCATION_POLICIES])
      .default("SAME_DYE_LOT_FIFO"),
    is_active: model.boolean().default(true),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_material_code_unique",
      on: ["code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);
