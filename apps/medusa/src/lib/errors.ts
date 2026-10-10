import { MedusaError } from "@medusajs/framework/utils";

/** Stable, machine-readable error codes (TDD section 40). */
export const ErrorCodes = {
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  DYE_LOT_POLICY_VIOLATION: "DYE_LOT_POLICY_VIOLATION",
  RESERVATION_CONTENTION: "RESERVATION_CONTENTION",
  INVARIANT_VIOLATION: "INVARIANT_VIOLATION",
  NOT_FOUND: "NOT_FOUND",
  INVALID_STATE: "INVALID_STATE",
  DUPLICATE: "DUPLICATE",
  STALE_VERSION: "STALE_VERSION",
  EXCEEDS_ISSUED: "EXCEEDS_ISSUED",
  OVER_RECEIPT: "OVER_RECEIPT",
  FORBIDDEN: "FORBIDDEN",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const domainError = (
  type: (typeof MedusaError.Types)[keyof typeof MedusaError.Types],
  code: ErrorCode,
  message: string
): MedusaError => new MedusaError(type, message, code);
