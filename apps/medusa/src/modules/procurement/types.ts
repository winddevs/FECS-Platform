export type ActorContext = {
  actor_id: string;
  correlation_id?: string | null;
};

export type CreatePurchaseOrderInput = ActorContext & {
  idempotency_key: string;
  supplier_id: string;
  currency_code?: string;
  expected_at?: Date | null;
  notes?: string | null;
  lines: Array<{
    material_id: string;
    uom: string;
    ordered_qty: number;
    unit_price?: number;
    over_receipt_pct?: number;
  }>;
};

export type PurchaseOrderAction = "approve" | "send" | "close" | "cancel";

export type TransitionPurchaseOrderInput = ActorContext & {
  purchase_order_id: string;
  action: PurchaseOrderAction;
  reason?: string | null;
};

export type GoodsReceiptLineInput = {
  purchase_order_line_id: string;
  qty: number;
  bucket?: "GOOD" | "QC_HOLD" | "DAMAGED";
  lot_no: string;
  dye_lot_no?: string | null;
  rolls?: Array<{ roll_code: string; qty: number; width_cm?: number | null }>;
};

export type PostGoodsReceiptInput = ActorContext & {
  idempotency_key: string;
  purchase_order_id: string;
  location_id: string;
  delivery_note?: string | null;
  lines: GoodsReceiptLineInput[];
};

export type PostedGoodsReceipt = {
  receipt: { id: string; receipt_no: string; status: string };
  purchase_order_id: string;
  supplier_id: string;
  location_id: string;
  lines: Array<{
    id: string;
    purchase_order_line_id: string;
    material_id: string;
    qty: number;
    bucket: "GOOD" | "QC_HOLD" | "DAMAGED";
    lot_no: string;
    dye_lot_no: string;
    rolls: Array<{
      roll_code: string;
      qty: number;
      width_cm?: number | null;
    }> | null;
  }>;
};
