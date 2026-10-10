import type { Command } from "../../lib/tx";
import type { MoType } from "./models/manufacturing-order";

export type { Command };

export type CreateBomInput = Command & {
  product_sku: string;
  output_uom?: string;
  notes?: string | null;
  lines: Array<{
    material_id: string;
    uom: string;
    qty_per_unit: number;
    waste_factor?: number;
  }>;
};

export type CreateRoutingInput = Command & {
  product_sku: string;
  notes?: string | null;
  operations: Array<{
    seq: number;
    code: string;
    name: string;
    work_center_type: string;
    standard_minutes?: number;
    qc_gate?: boolean;
  }>;
};

export type ReleaseVersionedInput = {
  id: string;
  actor_id: string;
  correlation_id?: string | null;
};

export type CreateMoInput = Command & {
  order_type: MoType;
  product_sku: string;
  lines: Array<{ sku: string; qty: number }>;
  due_date?: Date | null;
  customer_order_id?: string | null;
  bom_id?: string | null;
  routing_id?: string | null;
  notes?: string | null;
};

export type MoActor = {
  mo_id: string;
  actor_id: string;
  correlation_id?: string | null;
};

export type MaterialReadinessInput = MoActor & {
  /** Available quantity per material id, from Material Inventory. */
  availability: Record<string, number>;
};

export type RecordReservationsInput = MoActor & {
  reservations: Array<{
    material_id: string;
    reservation_id: string;
    qty: number;
  }>;
};

export type ReleaseMoInput = MoActor & {
  /** Optional split into several production batches; defaults to one. */
  batches?: Array<{ planned_qty: number }>;
};

export type CancelMoInput = MoActor & {
  reason: string;
  /** Net issued material per material from the ledger (issued - returned - scrapped). */
  settlement: Record<
    string,
    { issued: number; returned: number; scrapped: number }
  >;
};

export type CutPlanInput = MoActor & {
  batch_id: string;
  fabric_material_id: string;
  lays: Array<{
    roll_code: string;
    planned_consumption: number;
    size_ratio: Record<string, number>;
  }>;
};

export type CompleteCutInput = Command & {
  mo_id: string;
  batch_id: string;
  actual_consumption: number;
  bundles: Array<{ sku: string; qty: number }>;
  /** Overproduction beyond the MO line quantity needs explicit approval. */
  overproduction_approved?: boolean;
  /** Ledger settlement of the fabric: issued / returned / scrapped for this MO. */
  settlement: { issued: number; returned: number; scrapped: number };
  tolerance_pct?: number;
};

export type ExecuteOperationInput = Command & {
  bundle_id: string;
  op_seq: number;
  work_center_id?: string | null;
  input_qty: number;
  good_qty: number;
  rework_qty?: number;
  reject_qty?: number;
};

export type ApplyInspectionInput = Command & {
  bundle_id: string;
  inspection_id: string;
  pass_qty: number;
  rework_qty: number;
  reject_qty: number;
  hold_qty: number;
};

export type ReturnReworkInput = Command & {
  bundle_id: string;
  good_qty: number;
  scrap_qty: number;
};

export type PackBundleInput = Command & {
  bundle_id: string;
  qty: number;
};

export type PackedResult = {
  packing_record_id: string;
  pack_no: string;
  mo_id: string;
  batch_id: string;
  bundle_id: string;
  sku: string;
  qty: number;
};

export type MrpInput = Command & {
  /** Available stock per material (Material Inventory). */
  available: Record<string, number>;
  /** Confirmed incoming PO quantity per material. */
  incoming: Record<string, number>;
  parameters?: Record<string, unknown>;
};

export type MoRow = {
  id: string;
  mo_number: string;
  status: string;
  held_from_status: string | null;
  order_type: string;
  product_sku: string;
  planned_qty: number;
  completed_qty: number;
  bom_id: string;
  routing_id: string;
  customer_order_id: string | null;
  lines: Array<{ sku: string; qty: number }>;
};
