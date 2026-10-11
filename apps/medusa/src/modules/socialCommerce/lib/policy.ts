/**
 * Outbound policy (FR-SOC-008, FR-NOT-002): consent, 24h messaging window,
 * handoff, deduplication and rate limiting - evaluated BEFORE any send.
 */
export const NOTIFICATION_CATEGORIES = [
  "ORDER",
  "SHIPMENT",
  "PRODUCTION",
  "RETURN",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type PolicyIdentity = {
  consent_status: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";
  handoff_state: "BOT" | "HUMAN";
  last_inbound_at: Date | string | null;
  /** Categories this customer does not want to be notified about. */
  muted_categories?: string[] | null;
};

export type OutboundKind = "REPLY" | "NOTIFICATION";

export type PolicyDecision =
  | { allow: true }
  | {
      allow: false;
      reason:
        | "OPTED_OUT"
        | "HUMAN_HANDOFF"
        | "NO_CONSENT"
        | "OUTSIDE_WINDOW"
        | "RATE_LIMITED"
        | "CATEGORY_MUTED";
    };

/** Messenger's standard messaging window. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_NOTIFICATIONS_PER_HOUR = 5;

export const evaluateOutbound = (input: {
  identity: PolicyIdentity;
  kind: OutboundKind;
  now: Date;
  notificationsLastHour: number;
  /** What the notification is about; a muted category is never sent. */
  category?: NotificationCategory;
  /** Defaults to MAX_NOTIFICATIONS_PER_HOUR; configurable per platform. */
  maxPerHour?: number;
}): PolicyDecision => {
  const { identity, kind, now } = input;
  if (identity.consent_status === "OPTED_OUT") {
    return { allow: false, reason: "OPTED_OUT" };
  }
  if (kind === "REPLY") {
    // A bot must stay silent once a human has taken over the conversation.
    return identity.handoff_state === "HUMAN"
      ? { allow: false, reason: "HUMAN_HANDOFF" }
      : { allow: true };
  }
  if (identity.consent_status !== "OPTED_IN") {
    return { allow: false, reason: "NO_CONSENT" };
  }
  if (
    input.category &&
    (identity.muted_categories ?? []).includes(input.category)
  ) {
    return { allow: false, reason: "CATEGORY_MUTED" };
  }
  const last = identity.last_inbound_at
    ? new Date(identity.last_inbound_at).getTime()
    : 0;
  if (now.getTime() - last > WINDOW_MS) {
    return { allow: false, reason: "OUTSIDE_WINDOW" };
  }
  if (
    input.notificationsLastHour >=
    (input.maxPerHour ?? MAX_NOTIFICATIONS_PER_HOUR)
  ) {
    return { allow: false, reason: "RATE_LIMITED" };
  }
  return { allow: true };
};

/**
 * A human agent's reply (admin send). Allowed only while the conversation is
 * handed off to humans, the customer has not opted out, and the standard
 * messaging window is open.
 */
export const evaluateAgentReply = (
  identity: PolicyIdentity,
  now: Date
):
  | { allow: true }
  | {
      allow: false;
      reason: "OPTED_OUT" | "NOT_IN_HANDOFF" | "OUTSIDE_WINDOW";
    } => {
  if (identity.consent_status === "OPTED_OUT") {
    return { allow: false, reason: "OPTED_OUT" };
  }
  if (identity.handoff_state !== "HUMAN") {
    return { allow: false, reason: "NOT_IN_HANDOFF" };
  }
  const last = identity.last_inbound_at
    ? new Date(identity.last_inbound_at).getTime()
    : 0;
  return now.getTime() - last > WINDOW_MS
    ? { allow: false, reason: "OUTSIDE_WINDOW" }
    : { allow: true };
};
