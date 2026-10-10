import { fromUnits, toUnits } from "../../../lib/quantity";

export type MrpMaterialInput = {
  material_id: string;
  /** Unreserved demand from open MOs. */
  gross: number;
  available: number;
  incoming: number;
  safety_stock: number;
  mo_ids: string[];
  /** Usable stock per warehouse, for TRANSFER suggestions. */
  available_by_warehouse?: Record<string, number>;
  /** Earliest due date among the MOs that need this material. */
  earliest_due?: Date | null;
  /** Open purchase orders still to arrive. */
  incoming_orders?: IncomingOrder[];
};

export type IncomingOrder = {
  purchase_order_id: string;
  po_number: string;
  qty: number;
  expected_at: Date | null;
};

type SuggestionBase = {
  gross_requirement: number;
  available: number;
  confirmed_incoming: number;
  safety_buffer: number;
  net_requirement: number;
  suggested_qty: number;
  mo_ids: string[];
};

export type MrpSuggestionOutput =
  | (SuggestionBase & {
      type: "PURCHASE" | "TRANSFER" | "RESCHEDULE";
      material_id: string;
      sku?: null;
      detail?: Record<string, unknown>;
    })
  | (SuggestionBase & {
      type: "PRODUCE";
      material_id?: null;
      sku: string;
      detail?: Record<string, unknown>;
    });

export type MrpOptions = {
  /** Warehouse that consumes the material; enables TRANSFER suggestions. */
  demand_warehouse?: string | null;
  now?: Date;
};

/**
 * Gross-to-net (TDD section 13):
 *   net = gross - available - confirmed incoming + safety buffer
 * A positive net requirement yields a PURCHASE suggestion. The other
 * recommendations (FR-MRP-005) are separate checks over the same input:
 *   TRANSFER   the demand warehouse is short but another warehouse has stock
 *   RESCHEDULE an open PO arrives after the date an MO needs it (or is late)
 * PRODUCE is about finished SKUs (see produceSuggestions). This run never
 * creates a PO (FR-MRP-006).
 */
export const grossToNet = (
  items: MrpMaterialInput[],
  options: MrpOptions = {}
): MrpSuggestionOutput[] => {
  const out: MrpSuggestionOutput[] = [];
  const now = options.now ?? new Date();
  for (const item of items) {
    const base = {
      gross_requirement: item.gross,
      available: item.available,
      confirmed_incoming: item.incoming,
      safety_buffer: item.safety_stock,
      mo_ids: item.mo_ids,
    };
    const net =
      toUnits(item.gross) -
      toUnits(item.available) -
      toUnits(item.incoming) +
      toUnits(item.safety_stock);
    if (net > 0) {
      out.push({
        ...base,
        type: "PURCHASE",
        material_id: item.material_id,
        net_requirement: fromUnits(net),
        suggested_qty: fromUnits(net),
      });
    }

    const transfer = transferSuggestion(item, options.demand_warehouse);
    if (transfer) {
      out.push({
        ...base,
        type: "TRANSFER",
        material_id: item.material_id,
        net_requirement: transfer.shortage,
        suggested_qty: transfer.qty,
        detail: { to_warehouse: options.demand_warehouse, from: transfer.from },
      });
    }

    for (const late of lateOrders(item, now)) {
      out.push({
        ...base,
        type: "RESCHEDULE",
        material_id: item.material_id,
        net_requirement: late.qty,
        suggested_qty: late.qty,
        detail: {
          purchase_order_id: late.purchase_order_id,
          po_number: late.po_number,
          expected_at: late.expected_at?.toISOString() ?? null,
          needed_by: item.earliest_due?.toISOString() ?? null,
          reason: late.reason,
        },
      });
    }
  }
  return out;
};

const transferSuggestion = (
  item: MrpMaterialInput,
  demandWarehouse: string | null | undefined
): {
  qty: number;
  shortage: number;
  from: Array<{ warehouse: string; qty: number }>;
} | null => {
  const byWarehouse = item.available_by_warehouse;
  if (!demandWarehouse || !byWarehouse || item.gross <= 0) {
    return null;
  }
  const local = toUnits(byWarehouse[demandWarehouse] ?? 0);
  const shortage = toUnits(item.gross) + toUnits(item.safety_stock) - local;
  if (shortage <= 0) {
    return null;
  }
  const sources = Object.entries(byWarehouse)
    .filter(([warehouse]) => warehouse !== demandWarehouse)
    .map(([warehouse, qty]) => ({ warehouse, qty: toUnits(qty) }))
    .filter((source) => source.qty > 0)
    .sort((a, b) => b.qty - a.qty);
  const from: Array<{ warehouse: string; qty: number }> = [];
  let remaining = shortage;
  for (const source of sources) {
    if (remaining <= 0) {
      break;
    }
    const take = Math.min(source.qty, remaining);
    from.push({ warehouse: source.warehouse, qty: fromUnits(take) });
    remaining -= take;
  }
  if (from.length === 0) {
    return null;
  }
  return {
    qty: fromUnits(shortage - remaining),
    shortage: fromUnits(shortage),
    from,
  };
};

/**
 * Open POs that will not help in time. A PO is "late" when its expected date
 * is already past, or when it arrives after the earliest MO that needs the
 * material and the stock on hand cannot cover that MO without it.
 */
const lateOrders = (
  item: MrpMaterialInput,
  now: Date
): Array<IncomingOrder & { reason: "OVERDUE" | "AFTER_NEEDED_BY" }> => {
  const orders = item.incoming_orders ?? [];
  if (orders.length === 0 || item.gross <= 0) {
    return [];
  }
  const coveredWithoutIncoming =
    toUnits(item.available) - toUnits(item.safety_stock) >= toUnits(item.gross);
  const late: Array<IncomingOrder & { reason: "OVERDUE" | "AFTER_NEEDED_BY" }> =
    [];
  for (const order of orders) {
    if (!order.expected_at || order.qty <= 0) {
      continue;
    }
    if (order.expected_at.getTime() < now.getTime()) {
      late.push({ ...order, reason: "OVERDUE" });
      continue;
    }
    if (
      !coveredWithoutIncoming &&
      item.earliest_due &&
      order.expected_at.getTime() > item.earliest_due.getTime()
    ) {
      late.push({ ...order, reason: "AFTER_NEEDED_BY" });
    }
  }
  return late;
};

export type ProduceInput = {
  sku: string;
  sellable: number;
  /** Planned minus completed quantity of open MTS/REPLENISHMENT orders. */
  open_production: number;
  reorder_point: number;
  reorder_qty: number;
};

/**
 * PRODUCE: finished stock plus what is already in production is below the
 * reorder point. The suggestion tops it back up to the point, or by the fixed
 * reorder quantity when that is larger.
 */
export const produceSuggestions = (
  items: ProduceInput[]
): MrpSuggestionOutput[] => {
  const out: MrpSuggestionOutput[] = [];
  for (const item of items) {
    const projected = item.sellable + item.open_production;
    const gap = item.reorder_point - projected;
    if (gap <= 0) {
      continue;
    }
    const qty = Math.max(gap, item.reorder_qty);
    out.push({
      type: "PRODUCE",
      sku: item.sku,
      gross_requirement: item.reorder_point,
      available: item.sellable,
      confirmed_incoming: item.open_production,
      safety_buffer: 0,
      net_requirement: gap,
      suggested_qty: qty,
      mo_ids: [],
      detail: { reorder_point: item.reorder_point, projected },
    });
  }
  return out;
};
