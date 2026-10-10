import { model } from "@medusajs/framework/utils";

/** Warehouse locations (Requirement section 25). */
export const LOCATION_KINDS = [
  "RAW_MATERIAL",
  "WIP",
  "QC_HOLD",
  "QUARANTINE",
  "IN_TRANSIT",
  "RETURN_QC",
] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export const MaterialLocation = model
  .define("material_location", {
    id: model.id({ prefix: "mloc" }).primaryKey(),
    code: model.text(),
    name: model.text(),
    warehouse_code: model.text(),
    kind: model.enum([...LOCATION_KINDS]).default("RAW_MATERIAL"),
    is_active: model.boolean().default(true),
  })
  .indexes([
    {
      name: "IDX_material_location_code_unique",
      on: ["code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);
