export type ActorContext = {
  actor_id: string;
  correlation_id?: string | null;
};

export type StockBucket = "GOOD" | "QC_HOLD" | "DAMAGED";

export type LotInput = {
  lot_no: string;
  dye_lot_no?: string | null;
  supplier_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
};

export type ReceiveMaterialInput = ActorContext & {
  idempotency_key: string;
  material_id: string;
  location_id: string;
  lot: LotInput;
  /** Required for roll-tracked materials. */
  rolls?: Array<{ roll_code: string; qty: number; width_cm?: number | null }>;
  /** Required for non roll-tracked materials. */
  qty?: number;
  bucket?: StockBucket;
  reference_type?: string | null;
  reference_id?: string | null;
};

export type QcDecisionInput = ActorContext & {
  idempotency_key: string;
  balance_id: string;
  qty: number;
  decision: "RELEASE" | "REJECT";
  reason?: string | null;
};

export type ReserveMaterialInput = ActorContext & {
  idempotency_key: string;
  material_id: string;
  qty: number;
  reference_type: string;
  reference_id: string;
  reference_line?: string | null;
  location_id?: string | null;
  /** Planner approval to exceed the material's max dye lots. */
  planner_approved?: boolean;
};

export type ReleaseReservationInput = ActorContext & {
  idempotency_key: string;
  reservation_id: string;
  /** Defaults to everything outstanding. */
  qty?: number;
  reason?: string | null;
};

export type IssueMaterialInput = ActorContext & {
  idempotency_key: string;
  reservation_id: string;
  qty: number;
};

export type ReturnMaterialInput = ActorContext & {
  idempotency_key: string;
  material_id: string;
  lot_id?: string | null;
  roll_id?: string | null;
  location_id: string;
  qty: number;
  bucket: StockBucket;
  reference_type: string;
  reference_id: string;
};

export type ScrapMaterialInput = ActorContext & {
  idempotency_key: string;
  balance_id: string;
  qty: number;
  source_bucket: StockBucket;
  reason: string;
  reference_type: string;
  reference_id: string;
};

export type AdjustStockInput = ActorContext & {
  idempotency_key: string;
  balance_id: string;
  direction: "PLUS" | "MINUS";
  qty: number;
  reason: string;
};

export type CycleCountInput = ActorContext & {
  idempotency_key: string;
  balance_id: string;
  counted_qty: number;
  /** Balance version observed when counting started; stale counts are rejected. */
  expected_version: number;
  reason: string;
};

export type DecideCycleCountInput = ActorContext & {
  idempotency_key: string;
  count_id: string;
  decision: "APPROVE" | "REJECT";
  reason?: string | null;
};

export type DispatchTransferInput = ActorContext & {
  idempotency_key: string;
  balance_id: string;
  to_location_id: string;
  qty: number;
  transit_location_id?: string | null;
  notes?: string | null;
};

export type CloseTransferInput = ActorContext & {
  idempotency_key: string;
  transfer_id: string;
  reason?: string | null;
};

export type TransferStockInput = ActorContext & {
  idempotency_key: string;
  balance_id: string;
  to_location_id: string;
  qty: number;
  reference_type?: string | null;
  reference_id?: string | null;
};

export type ReconciliationIssue = {
  check:
    | "LEDGER_VS_BALANCE"
    | "RESERVATION_VS_BALANCE"
    | "BALANCE_INVARIANT"
    | "ORPHAN_RESERVATION_LINE"
    | "RESERVATION_HEADER_VS_LINES"
    | "ROLL_STATE";
  balance_id: string | null;
  detail: Record<string, unknown>;
};
