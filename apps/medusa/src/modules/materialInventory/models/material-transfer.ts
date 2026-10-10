import { model } from "@medusajs/framework/utils";

export const TRANSFER_STATUSES = [
  "IN_TRANSIT",
  "RECEIVED",
  "CANCELLED",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/**
 * Asynchronous inter-warehouse transfer (FR-INV-010). Stock leaves the source
 * balance at dispatch and waits in an IN_TRANSIT location until the receiving
 * warehouse confirms it, so it is never available in two places or in none.
 */
export const MaterialTransfer = model
  .define("material_transfer", {
    id: model.id({ prefix: "mxfr" }).primaryKey(),
    transfer_no: model.text(),
    status: model.enum([...TRANSFER_STATUSES]).default("IN_TRANSIT"),
    material_id: model.text(),
    lot_id: model.text().nullable(),
    roll_id: model.text().nullable(),
    qty: model.bigNumber(),
    from_balance_id: model.text(),
    from_location_id: model.text(),
    transit_balance_id: model.text(),
    transit_location_id: model.text(),
    to_location_id: model.text(),
    dispatched_by: model.text(),
    dispatched_at: model.dateTime(),
    closed_by: model.text().nullable(),
    closed_at: model.dateTime().nullable(),
    notes: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_material_transfer_no_unique",
      on: ["transfer_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_material_transfer_status", on: ["status"] },
    { name: "IDX_material_transfer_material", on: ["material_id"] },
  ]);
