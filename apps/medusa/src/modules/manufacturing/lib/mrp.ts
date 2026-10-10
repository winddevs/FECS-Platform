import { fromUnits, toUnits } from "../../../lib/quantity";

export type MrpMaterialInput = {
  material_id: string;
  /** Unreserved demand from open MOs. */
  gross: number;
  available: number;
  incoming: number;
  safety_stock: number;
  mo_ids: string[];
};

export type MrpSuggestionOutput = {
  type: "PURCHASE";
  material_id: string;
  gross_requirement: number;
  available: number;
  confirmed_incoming: number;
  safety_buffer: number;
  net_requirement: number;
  suggested_qty: number;
  mo_ids: string[];
};

/**
 * Gross-to-net (TDD section 13):
 *   net = gross - available - confirmed incoming + safety buffer
 * Only positive net requirements yield a PURCHASE suggestion. TRANSFER /
 * PRODUCE / RESCHEDULE are produced by their own planners later; this run
 * never creates a PO (FR-MRP-006).
 */
export const grossToNet = (
  items: MrpMaterialInput[]
): MrpSuggestionOutput[] => {
  const out: MrpSuggestionOutput[] = [];
  for (const item of items) {
    const net =
      toUnits(item.gross) -
      toUnits(item.available) -
      toUnits(item.incoming) +
      toUnits(item.safety_stock);
    if (net <= 0) {
      continue;
    }
    out.push({
      type: "PURCHASE",
      material_id: item.material_id,
      gross_requirement: item.gross,
      available: item.available,
      confirmed_incoming: item.incoming,
      safety_buffer: item.safety_stock,
      net_requirement: fromUnits(net),
      suggested_qty: fromUnits(net),
      mo_ids: item.mo_ids,
    });
  }
  return out;
};
