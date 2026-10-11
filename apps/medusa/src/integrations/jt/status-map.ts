import {
  SHIPMENT_STATUSES,
  type ShipmentStatus,
} from "../../modules/fulfillment/lib/shipment-state";

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
const isCanonical = (value: unknown): value is ShipmentStatus =>
  typeof value === "string" &&
  (SHIPMENT_STATUSES as readonly string[]).includes(value);

let cachedRaw: string | undefined;
let cachedMap = new Map<string, ShipmentStatus>();

/**
 * Exact codes from the carrier contract, set per account without a deploy:
 *   JT_STATUS_MAP_JSON='{"PICKUP_SCAN":"PICKED_UP","SIGNED":"DELIVERED"}'
 * They win over the keyword rules below, which remain the fallback for text
 * that the contract does not list. Invalid entries are ignored.
 */
const configuredMap = (env: NodeJS.ProcessEnv): Map<string, ShipmentStatus> => {
  const raw = env.JT_STATUS_MAP_JSON;
  if (raw === cachedRaw) {
    return cachedMap;
  }
  cachedRaw = raw;
  cachedMap = new Map();
  if (!raw) {
    return cachedMap;
  }
  try {
    for (const [code, status] of Object.entries(JSON.parse(raw))) {
      if (isCanonical(status)) {
        cachedMap.set(code.trim().toLowerCase(), status);
      }
    }
  } catch {
    // A malformed value falls back to the keyword rules.
  }
  return cachedMap;
};

export const mapJtStatus = (
  carrierStatus: string,
  env: NodeJS.ProcessEnv = process.env
): ShipmentStatus | null => {
  const exact = configuredMap(env).get(carrierStatus.trim().toLowerCase());
  if (exact) {
    return exact;
  }
  for (const rule of RULES) {
    if (rule.pattern.test(carrierStatus)) {
      return rule.status;
    }
  }
  return null;
};
