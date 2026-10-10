import { MedusaError } from "@medusajs/framework/utils";

import { domainError, ErrorCodes } from "../../../lib/errors";
import { fromUnits, toUnits } from "../../../lib/quantity";

/** Raw row shape returned by SQL (numeric columns arrive as strings). */
export type BalanceRow = {
  id: string;
  balance_key: string;
  material_id: string;
  lot_id: string | null;
  roll_id: string | null;
  location_id: string;
  on_hand_qty: string | number;
  reserved_qty: string | number;
  qc_hold_qty: string | number;
  damaged_qty: string | number;
  version: number | string;
};

/** Balance with quantities as scaled integers. */
export type Balance = {
  id: string;
  balanceKey: string;
  materialId: string;
  lotId: string | null;
  rollId: string | null;
  locationId: string;
  onHand: number;
  reserved: number;
  qcHold: number;
  damaged: number;
  version: number;
};

export type BalanceDelta = {
  onHand?: number;
  reserved?: number;
  qcHold?: number;
  damaged?: number;
};

export const parseBalance = (row: BalanceRow): Balance => ({
  id: row.id,
  balanceKey: row.balance_key,
  materialId: row.material_id,
  lotId: row.lot_id,
  rollId: row.roll_id,
  locationId: row.location_id,
  onHand: toUnits(row.on_hand_qty),
  reserved: toUnits(row.reserved_qty),
  qcHold: toUnits(row.qc_hold_qty),
  damaged: toUnits(row.damaged_qty),
  version: Number(row.version),
});

export const availableOf = (
  b: Pick<Balance, "onHand" | "reserved" | "qcHold" | "damaged">
): number => b.onHand - b.reserved - b.qcHold - b.damaged;

export const balanceKeyOf = (
  materialId: string,
  lotId: string | null,
  rollId: string | null,
  locationId: string
): string => `${materialId}|${lotId ?? ""}|${rollId ?? ""}|${locationId}`;

/**
 * Applies a delta and enforces the inventory invariants:
 *   all buckets >= 0  and  reserved + qc_hold + damaged <= on_hand
 */
export const applyDelta = (balance: Balance, delta: BalanceDelta): Balance => {
  const next: Balance = {
    ...balance,
    onHand: balance.onHand + (delta.onHand ?? 0),
    reserved: balance.reserved + (delta.reserved ?? 0),
    qcHold: balance.qcHold + (delta.qcHold ?? 0),
    damaged: balance.damaged + (delta.damaged ?? 0),
    version: balance.version + 1,
  };

  const negative =
    next.onHand < 0 || next.reserved < 0 || next.qcHold < 0 || next.damaged < 0;
  if (negative) {
    throw domainError(
      MedusaError.Types.NOT_ALLOWED,
      ErrorCodes.INSUFFICIENT_STOCK,
      `Insufficient stock on balance ${balance.id}`
    );
  }
  if (next.reserved + next.qcHold + next.damaged > next.onHand) {
    throw domainError(
      MedusaError.Types.NOT_ALLOWED,
      ErrorCodes.INSUFFICIENT_STOCK,
      `Insufficient available stock on balance ${balance.id}`
    );
  }
  return next;
};

export const toBalanceUpdate = (b: Balance) => ({
  id: b.id,
  on_hand_qty: fromUnits(b.onHand),
  reserved_qty: fromUnits(b.reserved),
  qc_hold_qty: fromUnits(b.qcHold),
  damaged_qty: fromUnits(b.damaged),
  version: b.version,
});

export const presentBalance = (b: Balance) => ({
  id: b.id,
  material_id: b.materialId,
  lot_id: b.lotId,
  roll_id: b.rollId,
  location_id: b.locationId,
  on_hand: fromUnits(b.onHand),
  reserved: fromUnits(b.reserved),
  qc_hold: fromUnits(b.qcHold),
  damaged: fromUnits(b.damaged),
  available: fromUnits(availableOf(b)),
  version: b.version,
});
