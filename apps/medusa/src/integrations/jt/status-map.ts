import type { ShipmentStatus } from "../../modules/fulfillment/lib/shipment-state";

/**
 * Maps J&T scan/status text to the platform's canonical states (FR-FUL-005).
 * Matching is keyword based and case-insensitive so small wording changes by
 * the carrier do not break tracking. Unknown statuses return null: the event
 * is stored for audit but never changes shipment state.
 */
const RULES: Array<{ pattern: RegExp; status: ShipmentStatus }> = [
  {
    pattern: /return(ed)?\s*(signed|received|complete)|returned to sender/i,
    status: "RETURNED",
  },
  {
    pattern: /returning|return(ed)? (scan|to)|send back/i,
    status: "RETURNING",
  },
  { pattern: /sign(ed)?|delivered|pod\b|received by/i, status: "DELIVERED" },
  {
    pattern: /fail|problem|unsuccessful|refus|reschedul|undeliver/i,
    status: "DELIVERY_FAILED",
  },
  {
    pattern: /out for delivery|delivering|delivery scan|with courier/i,
    status: "OUT_FOR_DELIVERY",
  },
  { pattern: /arriv(al|ed)|hub|sorting|warehouse in/i, status: "ARRIVED_HUB" },
  { pattern: /depart|in transit|transit|dispatch/i, status: "IN_TRANSIT" },
  { pattern: /pick(ed)?[- ]?up|collected|pickup scan/i, status: "PICKED_UP" },
  {
    pattern: /wait(ing)? (for )?pick|pickup pending|order (received|created)/i,
    status: "PICKUP_PENDING",
  },
  { pattern: /cancel/i, status: "CANCELLED" },
  { pattern: /exception|lost|damag|hold/i, status: "EXCEPTION" },
];

export const mapJtStatus = (carrierStatus: string): ShipmentStatus | null => {
  for (const rule of RULES) {
    if (rule.pattern.test(carrierStatus)) {
      return rule.status;
    }
  }
  return null;
};
