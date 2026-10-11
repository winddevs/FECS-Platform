/**
 * Commerce sellable projection (TDD section 20):
 *   physical on hand - warehouse hold - QC hold - safety stock
 *   - non-commerce (order-specific) allocation = sellable
 */
export type FgQuantities = {
  on_hand: number;
  warehouse_hold: number;
  qc_hold: number;
  allocated: number;
  safety_stock: number;
};

export const sellableOf = (q: FgQuantities): number =>
  Math.max(
    0,
    q.on_hand - q.warehouse_hold - q.qc_hold - q.allocated - q.safety_stock
  );

/** Physical quantity that is free to be held, allocated, shipped or adjusted. */
export const freeOf = (q: FgQuantities): number =>
  q.on_hand - q.warehouse_hold - q.qc_hold - q.allocated;

/**
 * Version guard used by every projection consumer: apply only strictly newer
 * versions (FR-FG-006). A repair (`resync`) may also re-apply the version that
 * was already applied, which rewrites Medusa's quantity from our ledger.
 */
export const shouldApplyVersion = (
  incoming: number,
  lastApplied: number,
  resync = false
): boolean => (resync ? incoming >= lastApplied : incoming > lastApplied);
