import { model } from "@medusajs/framework/utils";

export const RECEIPT_STATUSES = [
  "PENDING_INVENTORY",
  "POSTED",
  "VOID",
] as const;
export type GoodsReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/** A PO line can be received through many receipts (FR-PROC-003). */
export const GoodsReceipt = model
  .define("goods_receipt", {
    id: model.id({ prefix: "grn" }).primaryKey(),
    receipt_no: model.text(),
    purchase_order_id: model.text(),
    supplier_id: model.text(),
    location_id: model.text(),
    status: model.enum([...RECEIPT_STATUSES]).default("PENDING_INVENTORY"),
    delivery_note: model.text().nullable(),
    received_by: model.text(),
    received_at: model.dateTime(),
    idempotency_key: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_goods_receipt_no_unique",
      on: ["receipt_no"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_goods_receipt_po", on: ["purchase_order_id"] },
    { name: "IDX_goods_receipt_status", on: ["status"] },
  ]);

export const GoodsReceiptLine = model
  .define("goods_receipt_line", {
    id: model.id({ prefix: "grnl" }).primaryKey(),
    goods_receipt_id: model.text(),
    purchase_order_line_id: model.text(),
    material_id: model.text(),
    qty: model.bigNumber(),
    bucket: model.enum(["GOOD", "QC_HOLD", "DAMAGED"]).default("GOOD"),
    lot_no: model.text(),
    dye_lot_no: model.text().default(""),
    /** Measured rolls for roll-tracked materials: [{roll_code, qty, width_cm?}]. */
    rolls: model.json().nullable(),
  })
  .indexes([
    { name: "IDX_goods_receipt_line_receipt", on: ["goods_receipt_id"] },
    { name: "IDX_goods_receipt_line_po_line", on: ["purchase_order_line_id"] },
  ]);
