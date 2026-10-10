import type { MoStatus } from "../models/manufacturing-order";

/** Simplified customer-facing production status (FR-MFG-015, TDD s.24). */
export type CustomerProductionStatus =
  | "PREPARING_PRODUCTION"
  | "IN_PRODUCTION"
  | "QUALITY_CHECK"
  | "PREPARING_SHIPMENT"
  | "READY_TO_SHIP";

/**
 * Internal operations (cutting, sewing, rework, ...) are intentionally not
 * exposed to storefront or social channels.
 */
export const toCustomerProductionStatus = (
  status: MoStatus,
  finishedGoodsAllocated: boolean
): CustomerProductionStatus | null => {
  if (finishedGoodsAllocated) {
    return "READY_TO_SHIP";
  }
  switch (status) {
    case "DRAFT":
    case "PLANNED":
    case "MATERIAL_CHECK":
    case "MATERIAL_RESERVED":
    case "ON_HOLD":
      return "PREPARING_PRODUCTION";
    case "RELEASED":
    case "IN_PROGRESS":
    case "PARTIALLY_COMPLETED":
      return "IN_PRODUCTION";
    case "QC_PENDING":
      return "QUALITY_CHECK";
    case "PACKING":
    case "COMPLETED":
      return "PREPARING_SHIPMENT";
    default:
      // CANCELLED / FAILED are handled by customer support, not auto-surfaced.
      return null;
  }
};
