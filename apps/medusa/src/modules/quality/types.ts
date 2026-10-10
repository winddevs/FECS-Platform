import type { Command } from "../../lib/tx";

export type RecordInspectionInput = Command & {
  target_type: "BUNDLE" | "GOODS_RECEIPT_LINE";
  target_id: string;
  reference_type?: string | null;
  reference_id?: string | null;
  pass_qty: number;
  rework_qty?: number;
  reject_qty?: number;
  hold_qty?: number;
  defects?: Array<{ code: string; qty: number; note?: string }> | null;
  notes?: string | null;
};

export type InspectionResult = {
  id: string;
  inspection_no: string;
  target_type: string;
  target_id: string;
  reference_type: string | null;
  reference_id: string | null;
  qty_inspected: number;
  pass_qty: number;
  rework_qty: number;
  reject_qty: number;
  hold_qty: number;
};
