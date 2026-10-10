import {
  ChannelError,
  type MessageChannel,
} from "../../integrations/channel/channel";
import { evaluateOutbound } from "../../modules/socialCommerce/lib/policy";
import type SocialCommerceModuleService from "../../modules/socialCommerce/service";

export type NotifyInput = {
  customer_id: string;
  /** Stable per business fact, e.g. "shipment:<id>:OUT_FOR_DELIVERY". */
  dedupe_key: string;
  event_type: string;
  text: string;
};

export type NotifyResult = {
  sent: number;
  skipped: Array<{ identity_id: string; reason: string }>;
};

/**
 * Policy-gated proactive notification (FR-NOT-001/002). Duplicate events (the
 * bus is at-least-once) are dropped by the dedupe key; a channel outage is
 * recorded FAILED and never affects the business flow that produced the event.
 */
export const notifyCustomer = async (
  deps: {
    service: SocialCommerceModuleService;
    channel: MessageChannel;
    now?: () => Date;
  },
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
    const decision = evaluateOutbound({
      identity,
      kind: "NOTIFICATION",
      now,
      notificationsLastHour: await deps.service.notificationsInLastHour(
        identity.id
      ),
    });
    if (!decision.allow) {
      await deps.service.finishNotification({
        identity_id: identity.id,
        dedupe_key: input.dedupe_key,
        status: "SKIPPED",
        reason: decision.reason,
      });
      result.skipped.push({
        identity_id: identity.id,
        reason: decision.reason,
      });
      continue;
    }
    try {
      await deps.channel.send({
        account_id: identity.account_id,
        recipient_id: identity.external_user_id,
        text: input.text,
        kind: "UPDATE",
      });
      await deps.service.finishNotification({
        identity_id: identity.id,
        dedupe_key: input.dedupe_key,
        status: "SENT",
      });
      result.sent += 1;
    } catch (error) {
      const reason = error instanceof ChannelError ? error.kind : "ERROR";
      await deps.service.finishNotification({
        identity_id: identity.id,
        dedupe_key: input.dedupe_key,
        status: "FAILED",
        reason: `${reason}: ${(error as Error).message}`.slice(0, 200),
      });
      result.skipped.push({ identity_id: identity.id, reason });
    }
  }
  return result;
};
