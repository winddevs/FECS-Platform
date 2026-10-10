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
  // Problems first: "problem parcel" is an exception, not a failed delivery.
  { pattern: /problem|exception|lost|damag|hold/i, status: "EXCEPTION" },
  // Failures BEFORE delivered: "undelivered", "not delivered" and "refused to
  // sign" all contain words that would otherwise read as a completed delivery.
  {
    pattern: /fail|unsuccessful|refus|reschedul|undeliver|not delivered/i,
    status: "DELIVERY_FAILED",
  },
  {
    pattern: /\bdelivered\b|\bsigned\b|proof of delivery|\bpod\b|received by/i,
    status: "DELIVERED",
  },
  {
    pattern: /out for delivery|delivering|delivery scan|with courier/i,
    status: "OUT_FOR_DELIVERY",
  },
  // Departures before arrivals: "departure from hub" is leaving, not arriving.
  { pattern: /depart|in transit|transit|dispatch/i, status: "IN_TRANSIT" },
  { pattern: /arriv(al|ed)|hub|sorting|warehouse in/i, status: "ARRIVED_HUB" },
  { pattern: /pick(ed)?[- ]?up|collected|pickup scan/i, status: "PICKED_UP" },
  {
    pattern: /wait(ing)? (for )?pick|pickup pending|order (received|created)/i,
    status: "PICKUP_PENDING",
  },
  { pattern: /cancel/i, status: "CANCELLED" },
];
export const mapJtStatus = (carrierStatus: string): ShipmentStatus | null => {
  for (const rule of RULES) {
    if (rule.pattern.test(carrierStatus)) {
      return rule.status;
    }
  }
  return null;
};
