import { fromUnits, QTY_SCALE, toUnits } from "../../../lib/quantity";

export type BomLineInput = {
  material_id: string;
  uom: string;
  qty_per_unit: number | string;
  waste_factor: number | string;
};

export type MaterialRequirement = {
  material_id: string;
  uom: string;
  required_qty: number;
};

/**
 * required = planned_output x qty_per_unit x (1 + waste_factor)  (TDD s.12)
 * Computed on scaled integers; result is rounded up to the 4th decimal so we
 * never under-reserve.
 */
export const requiredQty = (
  plannedOutput: number,
  qtyPerUnit: number | string,
  wasteFactor: number | string
): number => {
  const perUnit = toUnits(qtyPerUnit);
  const waste = toUnits(wasteFactor);
  const scaled =
    BigInt(plannedOutput) * BigInt(perUnit) * BigInt(QTY_SCALE + waste);
  const divisor = BigInt(QTY_SCALE);
  const units = (scaled + divisor - 1n) / divisor;
  return fromUnits(Number(units));
};

/** Explodes a BOM for an output quantity; merges lines of the same material. */
export const explodeBom = (
  lines: BomLineInput[],
  plannedOutput: number
): MaterialRequirement[] => {
  const merged = new Map<string, MaterialRequirement>();
  for (const line of lines) {
    const qty = requiredQty(
      plannedOutput,
      line.qty_per_unit,
      line.waste_factor
    );
    const existing = merged.get(line.material_id);
    if (existing) {
      existing.required_qty = fromUnits(
        toUnits(existing.required_qty) + toUnits(qty)
      );
    } else {
      merged.set(line.material_id, {
        material_id: line.material_id,
        uom: line.uom,
        required_qty: qty,
      });
    }
  }
  return [...merged.values()];
};
