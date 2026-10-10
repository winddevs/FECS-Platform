import { MedusaError } from "@medusajs/framework/utils";

import { domainError, ErrorCodes } from "../../../lib/errors";

export type BundleState = {
  qty: number;
  current_seq: number;
  waiting_qty: number;
  buffer_qty: number;
  rework_qty: number;
  reject_qty: number;
  rework_out_qty: number;
  qc_released_qty: number;
  packed_qty: number;
};

export type FlowOp = { seq: number; code: string; qc_gate: boolean };

const fail = (code: keyof typeof ErrorCodes, message: string): never => {
  throw domainError(MedusaError.Types.NOT_ALLOWED, ErrorCodes[code], message);
};

export const sortOps = (ops: FlowOp[]): FlowOp[] =>
  [...ops].sort((a, b) => a.seq - b.seq);

/** Conservation of quantity (also enforced by a DB CHECK). */
export const assertInvariant = (b: BundleState): void => {
  const values = [
    b.waiting_qty,
    b.buffer_qty,
    b.rework_qty,
    b.reject_qty,
    b.rework_out_qty,
    b.qc_released_qty,
    b.packed_qty,
  ];
  const sum =
    b.waiting_qty +
    b.buffer_qty +
    b.rework_qty +
    b.reject_qty +
    b.rework_out_qty +
    b.qc_released_qty;
  if (
    values.some((v) => v < 0) ||
    sum !== b.qty ||
    b.packed_qty > b.qc_released_qty
  ) {
    fail("INVARIANT_VIOLATION", "Bundle quantities are inconsistent");
  }
};

/** Moves finished-at-this-op quantity to the next operation once nothing waits. */
export const advance = (state: BundleState, ops: FlowOp[]): BundleState => {
  const ordered = sortOps(ops);
  const next = { ...state };
  while (next.waiting_qty === 0 && next.buffer_qty > 0) {
    const following = ordered.find((op) => op.seq > next.current_seq);
    if (!following) {
      // Routings must end in a QC gate, which releases directly; reaching here
      // would mean un-inspected output, so refuse instead of releasing it.
      fail("INVALID_STATE", "Routing has no operation after the last step");
      break;
    }
    next.current_seq = following.seq;
    next.waiting_qty = next.buffer_qty;
    next.buffer_qty = 0;
  }
  return next;
};

export const currentOp = (state: BundleState, ops: FlowOp[]): FlowOp => {
  const op = ops.find((candidate) => candidate.seq === state.current_seq);
  if (!op) {
    return fail("INVALID_STATE", `No operation with seq ${state.current_seq}`);
  }
  return op;
};

export type OperationReport = {
  op_seq: number;
  input_qty: number;
  good_qty: number;
  rework_qty: number;
  reject_qty: number;
};

/** Operator-reported operation result (FR-MFG-009). */
export const reportOperation = (
  state: BundleState,
  ops: FlowOp[],
  report: OperationReport
): BundleState => {
  const op = currentOp(state, ops);
  if (report.op_seq !== state.current_seq) {
    fail(
      "INVALID_STATE",
      `Bundle is at operation ${state.current_seq}, not ${report.op_seq}`
    );
  }
  if (op.qc_gate) {
    fail(
      "INVALID_STATE",
      `Operation ${op.code} is a QC gate: it is completed by an inspection`
    );
  }
  const consumed = report.good_qty + report.rework_qty + report.reject_qty;
  if (
    [
      report.input_qty,
      report.good_qty,
      report.rework_qty,
      report.reject_qty,
    ].some((v) => !Number.isInteger(v) || v < 0) ||
    report.input_qty === 0
  ) {
    fail("INVALID_STATE", "Quantities must be non-negative whole numbers");
  }
  if (consumed > report.input_qty) {
    fail("INVARIANT_VIOLATION", "good + rework + reject cannot exceed input");
  }
  if (report.input_qty > state.waiting_qty) {
    fail(
      "INVALID_STATE",
      `Only ${state.waiting_qty} pcs are waiting at this operation`
    );
  }
  // Unreported remainder (input - consumed) stays waiting.
  return advance(
    {
      ...state,
      waiting_qty: state.waiting_qty - consumed,
      buffer_qty: state.buffer_qty + report.good_qty,
      rework_qty: state.rework_qty + report.rework_qty,
      reject_qty: state.reject_qty + report.reject_qty,
    },
    ops
  );
};

export type InspectionDecision = {
  pass_qty: number;
  rework_qty: number;
  reject_qty: number;
  hold_qty: number;
};

/** Applies a QC decision at a gate. Only PASS may progress (BR-003). */
export const applyInspection = (
  state: BundleState,
  ops: FlowOp[],
  decision: InspectionDecision
): BundleState => {
  const op = currentOp(state, ops);
  if (!op.qc_gate) {
    fail("INVALID_STATE", `Operation ${op.code} is not a QC gate`);
  }
  const decided = decision.pass_qty + decision.rework_qty + decision.reject_qty;
  const inspected = decided + decision.hold_qty;
  if (inspected > state.waiting_qty) {
    fail(
      "INVALID_STATE",
      `Only ${state.waiting_qty} pcs are waiting for inspection`
    );
  }
  const isLast =
    (() => {
      const sorted = sortOps(ops);
      return sorted[sorted.length - 1]?.seq;
    })() === op.seq;
  const next: BundleState = {
    ...state,
    waiting_qty: state.waiting_qty - decided,
    rework_qty: state.rework_qty + decision.rework_qty,
    reject_qty: state.reject_qty + decision.reject_qty,
    buffer_qty: isLast
      ? state.buffer_qty
      : state.buffer_qty + decision.pass_qty,
    qc_released_qty: isLast
      ? state.qc_released_qty + decision.pass_qty
      : state.qc_released_qty,
  };
  return advance(next, ops);
};

/**
 * Rework return: repaired pieces re-enter as a NEW child bundle that must pass
 * the final QC gate again; they never add to the parent's good output
 * (FR-MFG-012).
 */
export const returnRework = (
  state: BundleState,
  result: { good_qty: number; scrap_qty: number }
): BundleState => {
  if (
    result.good_qty < 0 ||
    result.scrap_qty < 0 ||
    result.good_qty + result.scrap_qty === 0
  ) {
    fail("INVALID_STATE", "Provide repaired and/or scrapped rework quantity");
  }
  if (result.good_qty + result.scrap_qty > state.rework_qty) {
    fail("INVALID_STATE", `Only ${state.rework_qty} pcs are in rework`);
  }
  return {
    ...state,
    rework_qty: state.rework_qty - result.good_qty - result.scrap_qty,
    rework_out_qty: state.rework_out_qty + result.good_qty,
    reject_qty: state.reject_qty + result.scrap_qty,
  };
};

export const pack = (state: BundleState, qty: number): BundleState => {
  if (!Number.isInteger(qty) || qty <= 0) {
    fail("INVALID_STATE", "Pack quantity must be a positive whole number");
  }
  if (qty > state.qc_released_qty - state.packed_qty) {
    fail(
      "INVALID_STATE",
      `Only ${state.qc_released_qty - state.packed_qty} QC-released pcs can be packed`
    );
  }
  return { ...state, packed_qty: state.packed_qty + qty };
};

/** Validates a routing before release: it must end in a QC gate. */
export const assertRoutingEndsWithGate = (ops: FlowOp[]): void => {
  const sorted = sortOps(ops);
  const last = sorted[sorted.length - 1];
  if (!last?.qc_gate) {
    fail("INVALID_STATE", "A routing must end with a QC gate operation");
  }
};
