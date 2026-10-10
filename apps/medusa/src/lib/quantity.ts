import { MedusaError } from "@medusajs/framework/utils";

/**
 * Stock quantities are decimal (e.g. metres of fabric) but all arithmetic is
 * performed on scaled integers so that ledger sums are exact.
 * 4 decimal places are supported.
 */
export const QTY_SCALE = 10_000;
const MAX_DECIMALS = 4;

export const toUnits = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid quantity: ${String(value)}`
    );
  }
  return Math.round(parsed * QTY_SCALE);
};

export const fromUnits = (units: number): number => units / QTY_SCALE;

/** True when the number has no more than MAX_DECIMALS fractional digits. */
export const hasValidPrecision = (value: number): boolean =>
  Math.abs(value * QTY_SCALE - Math.round(value * QTY_SCALE)) < 1e-6;

export const assertPositiveQty = (value: number, label = "qty"): number => {
  if (!(value > 0) || !hasValidPrecision(value)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${label} must be a positive number with at most ${MAX_DECIMALS} decimals`
    );
  }
  return toUnits(value);
};
