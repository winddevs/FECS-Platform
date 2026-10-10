import { model } from "@medusajs/framework/utils";

export const PO_STATUSES = [
  "DRAFT",
  "APPROVED",
  "SENT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const PurchaseOrder = model
  .define("purchase_order", {
    id: model.id({ prefix: "po" }).primaryKey(),
    po_number: model.text(),
    supplier_id: model.text(),
    status: model.enum([...PO_STATUSES]).default("DRAFT"),
    currency_code: model.text().default("VND"),
    expected_at: model.dateTime().nullable(),
    notes: model.text().nullable(),
    created_by: model.text(),
    approved_by: model.text().nullable(),
    approved_at: model.dateTime().nullable(),
    sent_at: model.dateTime().nullable(),
    closed_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_purchase_order_number_unique",
      on: ["po_number"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_purchase_order_supplier", on: ["supplier_id"] },
    { name: "IDX_purchase_order_status", on: ["status"] },
  ]);

export const PurchaseOrderLine = model
  .define("purchase_order_line", {
    id: model.id({ prefix: "pol" }).primaryKey(),
    purchase_order_id: model.text(),
    line_no: model.number(),
    material_id: model.text(),
    uom: model.text(),
    ordered_qty: model.bigNumber(),
    /** Accepted quantity received so far; maintained by goods receipts. */
    received_qty: model.bigNumber().default(0),
    /** Allowed over-receipt above ordered_qty, in percent. */
    over_receipt_pct: model.number().default(5),
    unit_price: model.bigNumber().default(0),
  })
  .indexes([
    {
      name: "IDX_purchase_order_line_no_unique",
      on: ["purchase_order_id", "line_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_purchase_order_line_material", on: ["material_id"] },
  ]);
