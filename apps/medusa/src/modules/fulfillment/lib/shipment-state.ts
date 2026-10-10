/** Canonical shipment states (TDD section 32). */
export const SHIPMENT_STATUSES = [
  "CREATED",
  "PICKUP_PENDING",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNING",
  "RETURNED",
  "CANCELLED",
  "EXCEPTION",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const TERMINAL_STATUSES: readonly ShipmentStatus[] = [
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
];

/** Progress along the happy path; used to reject late/out-of-order callbacks. */
const RANK: Partial<Record<ShipmentStatus, number>> = {
  CREATED: 0,
  PICKUP_PENDING: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  ARRIVED_HUB: 4,
  OUT_FOR_DELIVERY: 5,
  DELIVERED: 6,
};

export type TransitionDecision =
  | { apply: true }
  | {
      apply: false;
      reason: "DUPLICATE" | "REGRESSION" | "TERMINAL" | "NOT_ALLOWED";
    };

/**
 * Transition guard: carriers resend and reorder events, so a late
 * IN_TRANSIT must never pull an OUT_FOR_DELIVERY parcel backwards.
 */
export const decideTransition = (
  current: ShipmentStatus,
  next: ShipmentStatus
): TransitionDecision => {
  if (current === next) {
    return { apply: false, reason: "DUPLICATE" };
  }
  if (TERMINAL_STATUSES.includes(current)) {
    return { apply: false, reason: "TERMINAL" };
  }
  if (next === "EXCEPTION" || current === "EXCEPTION") {
    return { apply: true };
  }
  if (next === "CANCELLED") {
    return current === "CREATED" || current === "PICKUP_PENDING"
      ? { apply: true }
      : { apply: false, reason: "NOT_ALLOWED" };
  }
  if (current === "DELIVERY_FAILED") {
    return ["OUT_FOR_DELIVERY", "RETURNING", "DELIVERED"].includes(next)
      ? { apply: true }
      : { apply: false, reason: "REGRESSION" };
  }
  if (next === "DELIVERY_FAILED") {
    return RANK[current] !== undefined &&
      (RANK[current] as number) >= RANK.PICKED_UP!
      ? { apply: true }
      : { apply: false, reason: "NOT_ALLOWED" };
  }
  if (current === "RETURNING") {
    return next === "RETURNED"
      ? { apply: true }
      : { apply: false, reason: "REGRESSION" };
  }
  if (next === "RETURNING") {
    return (RANK[current] ?? -1) >= (RANK.PICKED_UP as number)
      ? { apply: true }
      : { apply: false, reason: "NOT_ALLOWED" };
  }
  if (next === "RETURNED") {
    return { apply: false, reason: "NOT_ALLOWED" };
  }
  const from = RANK[current];
  const to = RANK[next];
  if (from === undefined || to === undefined) {
    return { apply: false, reason: "NOT_ALLOWED" };
  }
  return to > from ? { apply: true } : { apply: false, reason: "REGRESSION" };
};

/** Statuses for which polling still makes sense. */
export const isActiveStatus = (status: ShipmentStatus): boolean =>
  !TERMINAL_STATUSES.includes(status);

export const CREATE_STATES = [
  "PENDING",
  "SUCCEEDED",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
  "UNKNOWN",
] as const;
export type CreateState = (typeof CREATE_STATES)[number];
