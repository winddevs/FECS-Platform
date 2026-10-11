import {
  ChannelError,
  type MessageChannel,
} from "../../integrations/channel/channel";
import {
  evaluateOutbound,
  type NotificationCategory,
} from "../../modules/socialCommerce/lib/policy";
import type SocialCommerceModuleService from "../../modules/socialCommerce/service";
import type { IdentityView } from "../../modules/socialCommerce/service";

export type NotifyInput = {
  customer_id: string;
  /** Stable per business fact, e.g. "shipment:<id>:OUT_FOR_DELIVERY". */
  dedupe_key: string;
  event_type: string;
  text: string;
  /** Lets the customer switch this kind of message off. */
  category?: NotificationCategory;
};

export type NotifyResult = {
  sent: number;
  skipped: Array<{ identity_id: string; reason: string }>;
};

/** Reasons that may clear on their own: the message is kept, not dropped. */
const DEFERRABLE_REASONS = new Set(["OUTSIDE_WINDOW", "RATE_LIMITED"]);
/** A deferred message older than this is no longer worth sending. */
const DEFERRED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FLUSH_PER_CALL = 3;

type NotifyDeps = {
  service: SocialCommerceModuleService;
  channel: MessageChannel;
  /** Rate limit per customer and hour; defaults to the policy constant. */
  maxPerHour?: number;
  now?: () => Date;
};

/**
 * Policy-gated proactive notification (FR-NOT-001/002). Duplicate events (the
 * bus is at-least-once) are dropped by the dedupe key. A notification that the
 * policy cannot send YET (messaging window closed, rate limit) or that hit a
 * channel outage is DEFERRED with its text and sent later, instead of being
 * lost. A channel outage never affects the business flow that produced it.
 */
export const notifyCustomer = async (
  deps: NotifyDeps,
  input: NotifyInput
): Promise<NotifyResult> => {
  const now = (deps.now ?? (() => new Date()))();
  const result: NotifyResult = { sent: 0, skipped: [] };
  const identities = (
    await deps.service.identitiesForCustomer(input.customer_id)
  ).filter((i) => i.channel === deps.channel.code);

  for (const identity of identities) {
    const fresh = await deps.service.claimNotification({
      identity_id: identity.id,
      dedupe_key: input.dedupe_key,
      event_type: input.event_type,
    });
    if (!fresh) {
      result.skipped.push({ identity_id: identity.id, reason: "DUPLICATE" });
      continue;
    }
    const outcome = await sendOrDefer(deps, identity, {
      dedupe_key: input.dedupe_key,
      text: input.text,
      category: input.category,
      maxPerHour: deps.maxPerHour,
      now,
    });
    if (outcome.sent) {
      result.sent += 1;
    } else {
      result.skipped.push({ identity_id: identity.id, reason: outcome.reason });
    }
  }
  return result;
};

const sendOrDefer = async (
  deps: NotifyDeps,
  identity: IdentityView,
  message: {
    dedupe_key: string;
    text: string;
    now: Date;
    category?: NotificationCategory;
    maxPerHour?: number;
  }
): Promise<{ sent: true } | { sent: false; reason: string }> => {
  const decision = evaluateOutbound({
    identity,
    kind: "NOTIFICATION",
    now: message.now,
    category: message.category,
    maxPerHour: message.maxPerHour,
    notificationsLastHour: await deps.service.notificationsInLastHour(
      identity.id
    ),
  });
  if (!decision.allow) {
    const deferrable = DEFERRABLE_REASONS.has(decision.reason);
    await deps.service.finishNotification({
      identity_id: identity.id,
      dedupe_key: message.dedupe_key,
      status: deferrable ? "DEFERRED" : "SKIPPED",
      reason: decision.reason,
      text: deferrable ? message.text : null,
    });
    return { sent: false, reason: decision.reason };
  }
  try {
    await deps.channel.send({
      account_id: identity.account_id,
      recipient_id: identity.external_user_id,
      text: message.text,
      kind: "UPDATE",
    });
    await deps.service.finishNotification({
      identity_id: identity.id,
      dedupe_key: message.dedupe_key,
      status: "SENT",
    });
    return { sent: true };
  } catch (error) {
    const retryable =
      error instanceof ChannelError && error.kind === "RETRYABLE";
    const reason = error instanceof ChannelError ? error.kind : "ERROR";
    await deps.service.finishNotification({
      identity_id: identity.id,
      dedupe_key: message.dedupe_key,
      status: retryable ? "DEFERRED" : "FAILED",
      reason: `${reason}: ${(error as Error).message}`.slice(0, 200),
      text: retryable ? message.text : null,
    });
    return { sent: false, reason };
  }
};

/**
 * Sends deferred notifications that the policy now allows (the customer wrote
 * again, or the channel recovered). Called after an inbound message and by a
 * sweeper job. Expired ones are dropped. Never throws.
 */
export const flushDeferredNotifications = async (
  deps: NotifyDeps,
  identity: IdentityView
): Promise<{ sent: number }> => {
  const now = (deps.now ?? (() => new Date()))();
  let sent = 0;
  try {
    const pending = await deps.service.listDeferred(
      identity.id,
      MAX_FLUSH_PER_CALL
    );
    for (const item of pending) {
      if (
        now.getTime() - new Date(item.created_at).getTime() >
        DEFERRED_TTL_MS
      ) {
        await deps.service.finishNotification({
          identity_id: identity.id,
          dedupe_key: item.dedupe_key,
          status: "SKIPPED",
          reason: "EXPIRED",
        });
        continue;
      }
      const outcome = await sendOrDefer(deps, identity, {
        dedupe_key: item.dedupe_key,
        text: item.text,
        now,
      });
      if (!outcome.sent) {
        // Still blocked (window, rate limit, outage): keep order, try later.
        break;
      }
      sent += 1;
    }
  } catch {
    // The deferred queue is best effort; the next trigger retries it.
  }
  return { sent };
};
