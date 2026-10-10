import { MedusaError } from "@medusajs/framework/utils";

import { domainError, ErrorCodes } from "../../../lib/errors";
import type { MoStatus } from "../models/manufacturing-order";

/**
 * Manufacturing Order state machine (TDD section 14). Only domain commands
 * may transition state; every move is validated here.
 */
export const MO_TRANSITIONS: Record<MoStatus, readonly MoStatus[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["MATERIAL_CHECK", "ON_HOLD", "CANCELLED"],
  MATERIAL_CHECK: ["MATERIAL_RESERVED", "PLANNED", "ON_HOLD", "CANCELLED"],
  MATERIAL_RESERVED: ["RELEASED", "MATERIAL_CHECK", "ON_HOLD", "CANCELLED"],
  RELEASED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: [
    "QC_PENDING",
    "PACKING",
    "PARTIALLY_COMPLETED",
    "COMPLETED",
    "FAILED",
    "ON_HOLD",
  ],
  QC_PENDING: ["IN_PROGRESS", "PACKING", "ON_HOLD"],
  PACKING: [
    "IN_PROGRESS",
    "QC_PENDING",
    "COMPLETED",
    "PARTIALLY_COMPLETED",
    "ON_HOLD",
  ],
  PARTIALLY_COMPLETED: ["IN_PROGRESS", "COMPLETED"],
  // ON_HOLD resumes to the status it was held from (handled by the service).
  ON_HOLD: [
    "PLANNED",
    "MATERIAL_CHECK",
    "MATERIAL_RESERVED",
    "RELEASED",
    "IN_PROGRESS",
    "QC_PENDING",
    "PACKING",
    "CANCELLED",
  ],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

export const canTransition = (from: MoStatus, to: MoStatus): boolean =>
  MO_TRANSITIONS[from].includes(to);

export const assertTransition = (from: MoStatus, to: MoStatus): void => {
  if (!canTransition(from, to)) {
    throw domainError(
      MedusaError.Types.NOT_ALLOWED,
      ErrorCodes.INVALID_STATE,
      `Manufacturing order cannot move from ${from} to ${to}`
    );
  }
};

/** Statuses in which shop-floor work may be reported. */
export const SHOP_FLOOR_STATUSES: readonly MoStatus[] = [
  "RELEASED",
  "IN_PROGRESS",
  "QC_PENDING",
  "PACKING",
  "PARTIALLY_COMPLETED",
];

/** Statuses whose material demand has not been reserved yet (MRP input). */
export const UNRESERVED_STATUSES: readonly MoStatus[] = [
  "PLANNED",
  "MATERIAL_CHECK",
];
