/**
 * Refund ceiling (FR-RET-005): a return may refund at most the value of the
 * pieces that came back, minus whatever other returns on the same order have
 * already refunded or are refunding. Money is compared with a tolerance of
 * half a minor unit so currencies with and without decimals both work.
 */
const EPSILON = 0.005;

export type ReturnedLine = { unit_total: number; qty: number };

export const returnedValue = (lines: ReturnedLine[]): number =>
  lines.reduce((sum, line) => sum + line.unit_total * line.qty, 0);

export const refundCeiling = (
  returned: number,
  refundedByOtherReturns: number
): number => Math.max(0, returned - refundedByOtherReturns);

export const exceedsCeiling = (amount: number, ceiling: number): boolean =>
  amount > ceiling + EPSILON;
