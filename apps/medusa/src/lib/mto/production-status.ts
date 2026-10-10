import type FinishedGoodsModuleService from "../../modules/finishedGoods/service";
import {
  toCustomerProductionStatus,
  type CustomerProductionStatus,
} from "../../modules/manufacturing/lib/production-status";
import type { MoStatus } from "../../modules/manufacturing/models/manufacturing-order";
import type ManufacturingModuleService from "../../modules/manufacturing/service";

const ORDER: CustomerProductionStatus[] = [
  "PREPARING_PRODUCTION",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "PREPARING_SHIPMENT",
  "READY_TO_SHIP",
];

export type OrderProductionStatus = {
  order_id: string;
  status: CustomerProductionStatus | null;
};

/**
 * Customer-facing production state for a made-to-order order (FR-MFG-015).
 * Internal operations are never exposed. An order with several MOs reports
 * the LEAST advanced one, so "ready to ship" really means everything is.
 * Returns null when the order has no MTO manufacturing orders.
 */
export const productionStatusForOrder = async (
  deps: { mfg: ManufacturingModuleService; fg: FinishedGoodsModuleService },
  orderId: string
): Promise<OrderProductionStatus | null> => {
  const mos = await deps.mfg.listManufacturingOrders({
    customer_order_id: orderId,
    order_type: "MTO",
  });
  if (mos.length === 0) {
    return null;
  }
  const allocations = await deps.fg.listFgAllocations({ order_id: orderId });
  const allocatedBySku = new Map<string, number>();
  for (const a of allocations) {
    if (a.status !== "RELEASED") {
      allocatedBySku.set(
        a.sku,
        (allocatedBySku.get(a.sku) ?? 0) + Number(a.qty)
      );
    }
  }

  const statuses: CustomerProductionStatus[] = [];
  for (const mo of mos) {
    const lines = mo.lines as unknown as Array<{ sku: string; qty: number }>;
    const allocated = lines.every(
      (l) => (allocatedBySku.get(l.sku) ?? 0) >= l.qty
    );
    const status = toCustomerProductionStatus(mo.status as MoStatus, allocated);
    if (status) {
      statuses.push(status);
    }
  }
  if (statuses.length === 0) {
    return { order_id: orderId, status: null };
  }
  const least = statuses.reduce((a, b) =>
    ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b
  );
  return { order_id: orderId, status: least };
};
