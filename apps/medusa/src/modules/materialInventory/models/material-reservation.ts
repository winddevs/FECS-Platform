import { model } from "@medusajs/framework/utils";

export const RESERVATION_STATUSES = [
  "ACTIVE",
  "PARTIALLY_ISSUED",
  "ISSUED",
  "RELEASED",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * Reservation header. Reservation is not consumption (BR-004): it only raises
 * `reserved_qty` on balances; physical `on_hand` drops at issue time.
 */
export const MaterialReservation = model
  .define("material_reservation", {
    id: model.id({ prefix: "mrsv" }).primaryKey(),
    reservation_no: model.text(),
    material_id: model.text(),
    reference_type: model.text(),
    reference_id: model.text(),
    reference_line: model.text().nullable(),
    requested_qty: model.bigNumber(),
    issued_qty: model.bigNumber().default(0),
    released_qty: model.bigNumber().default(0),
    status: model.enum([...RESERVATION_STATUSES]).default("ACTIVE"),
    dye_lot_count: model.number().default(0),
    planner_approved: model.boolean().default(false),
    created_by: model.text(),
    idempotency_key: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_material_reservation_no_unique",
      on: ["reservation_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_material_reservation_reference",
      on: ["reference_type", "reference_id"],
    },
    { name: "IDX_material_reservation_material", on: ["material_id"] },
  ]);

/** One allocation per balance (roll/lot/location) backing a reservation. */
export const MaterialReservationLine = model
  .define("material_reservation_line", {
    id: model.id({ prefix: "mrsl" }).primaryKey(),
    reservation_id: model.text(),
    balance_id: model.text(),
    material_id: model.text(),
    lot_id: model.text().nullable(),
    roll_id: model.text().nullable(),
    location_id: model.text(),
    reserved_qty: model.bigNumber(),
    issued_qty: model.bigNumber().default(0),
    released_qty: model.bigNumber().default(0),
  })
  .indexes([
    {
      name: "IDX_material_reservation_line_reservation",
      on: ["reservation_id"],
    },
    { name: "IDX_material_reservation_line_balance", on: ["balance_id"] },
  ]);
