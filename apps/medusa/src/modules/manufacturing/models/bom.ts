import { model } from "@medusajs/framework/utils";

export const VERSIONED_STATUSES = ["DRAFT", "RELEASED", "OBSOLETE"] as const;
export type VersionedStatus = (typeof VERSIONED_STATUSES)[number];

/**
 * Versioned BOM (FR-MRP-001). Once RELEASED the header and its lines are
 * immutable; a DB trigger enforces it (see migrations).
 */
export const Bom = model
  .define("bom", {
    id: model.id({ prefix: "bom" }).primaryKey(),
    product_sku: model.text(),
    version: model.number(),
    status: model.enum([...VERSIONED_STATUSES]).default("DRAFT"),
    output_uom: model.text().default("pcs"),
    notes: model.text().nullable(),
    created_by: model.text(),
    released_by: model.text().nullable(),
    released_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_bom_sku_version_unique",
      on: ["product_sku", "version"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_bom_sku_status", on: ["product_sku", "status"] },
  ]);

export const BomLine = model
  .define("bom_line", {
    id: model.id({ prefix: "bomln" }).primaryKey(),
    bom_id: model.text(),
    line_no: model.number(),
    material_id: model.text(),
    uom: model.text(),
    /** Material consumed per finished unit (4 decimals). */
    qty_per_unit: model.bigNumber(),
    /** Fractional waste, e.g. 0.05 = 5%. */
    waste_factor: model.bigNumber().default(0),
  })
  .indexes([
    {
      name: "IDX_bom_line_no_unique",
      on: ["bom_id", "line_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_bom_line_material", on: ["material_id"] },
  ]);
