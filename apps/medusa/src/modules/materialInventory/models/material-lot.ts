import { model } from "@medusajs/framework/utils";

/**
 * Supplier lot + dye lot. `dye_lot_no` is an empty string when not applicable
 * (keeps the uniqueness index simple and NULL-free).
 * Lots are never deleted: consumed lots stay queryable (NFR-AUD-003).
 */
export const MaterialLot = model
  .define("material_lot", {
    id: model.id({ prefix: "mlot" }).primaryKey(),
    material_id: model.text(),
    lot_no: model.text(),
    dye_lot_no: model.text().default(""),
    supplier_id: model.text().nullable(),
    source_type: model.text().nullable(),
    source_id: model.text().nullable(),
    received_at: model.dateTime(),
  })
  .indexes([
    {
      name: "IDX_material_lot_identity_unique",
      on: ["material_id", "lot_no", "dye_lot_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_material_lot_material", on: ["material_id"] },
    { name: "IDX_material_lot_source", on: ["source_type", "source_id"] },
  ]);
