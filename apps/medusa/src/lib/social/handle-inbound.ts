import {
  ChannelError,
  type InboundMessage,
  type MessageChannel,
} from "../../integrations/channel/channel";
import {
  parseIntent,
  type Intent,
} from "../../modules/socialCommerce/lib/intent";
import {
  detectLocale,
  orderText,
  productionText,
  shipmentText,
  t,
  type Locale,
} from "../../modules/socialCommerce/lib/messages";
import { evaluateOutbound } from "../../modules/socialCommerce/lib/policy";
import type SocialCommerceModuleService from "../../modules/socialCommerce/service";
import type { IdentityView } from "../../modules/socialCommerce/service";
import { resolveIntentWithAgent, type AgentModel } from "./agent";
import { flushDeferredNotifications } from "./notify";
import type { SocialReaders } from "./tools";

export type SocialDeps = {
  service: SocialCommerceModuleService;
  channel: MessageChannel;
  readers: SocialReaders;
  locale: Locale;
  flags: { readTools: boolean; stateChange: boolean };
  /** Optional language model that picks a read-only action for free text. */
  agent?: AgentModel | null;
  now?: () => Date;
};

export type InboundOutcome =
  | { status: "DUPLICATE" }
  | { status: "REPLIED"; reply: string; intent: string }
  | { status: "SUPPRESSED"; reason: string; intent: string };

const MAX_SEARCH_HITS = 3;
const MIN_AGENT_TEXT = 4;

/**
 * Rules first: commands, order numbers and consent words are matched exactly
 * and never reach a model. Only text the rules call HELP is offered to the
 * language model (when enabled), which can pick a read-only action.
 */
const resolveIntent = async (
  deps: SocialDeps,
  text: string,
  locale: Locale
): Promise<Intent> => {
  const byRules = parseIntent(text);
  if (
    byRules.name !== "HELP" ||
    !deps.agent ||
    text.trim().length < MIN_AGENT_TEXT
  ) {
    return byRules;
  }
  return await resolveIntentWithAgent(deps.agent, { text, locale });
};
/** Per identity; far above human typing speed, below what a script sends. */
const MAX_INBOUND_PER_MINUTE = 30;
const SECONDS_PER_MINUTE = 60;
/** The code is a credential: it must not stay in the stored conversation. */
const REDACTED_LINK_TEXT = "link ********";

/**
 * Handles one verified, deduplicated Messenger message. Replies are always
 * subject to the outbound policy; a retryable send failure is rethrown so the
 * inbox retries, while the idempotent `recordInbound` prevents double replies.
 */
export const handleInboundMessage = async (
  deps: SocialDeps,
  inbound: InboundMessage
): Promise<InboundOutcome> => {
  const { service, channel, readers } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const identity = await service.touchIdentity({
    channel: inbound.channel,
    account_id: inbound.account_id,
    external_user_id: inbound.external_user_id,
    at: inbound.occurred_at,
  });
  // Reply in the language the customer writes: this message if it is clear,
  // else what we learned before, else the shop default.
  const written = detectLocale(inbound.text);
  const learned = identity.locale === "en" || identity.locale === "vi";
  const locale: Locale =
    written ?? (learned ? (identity.locale as Locale) : deps.locale);
  if (written && written !== identity.locale) {
    await service.setIdentityLocale({
      identity_id: identity.id,
      locale: written,
    });
  }
  const intent = await resolveIntent(deps, inbound.text, locale);

  const recorded = await service.recordInbound({
    identity_id: identity.id,
    message_id: inbound.message_id,
    text: intent.name === "LINK" ? REDACTED_LINK_TEXT : inbound.text,
    intent: intent.name,
  });
  if (recorded.already_processed) {
    return { status: "DUPLICATE" };
  }

  const finishSilently = async (reason: string): Promise<InboundOutcome> => {
    await service.markInboundProcessed({
      identity_id: identity.id,
      message_id: inbound.message_id,
    });
    return { status: "SUPPRESSED", reason, intent: intent.name };
  };
  // Flood control: every message costs several writes and possibly a Graph API
  // call, so one identity cannot be allowed to send without limit.
  if (
    (await service.inboundCountSince(identity.id, SECONDS_PER_MINUTE)) >
    MAX_INBOUND_PER_MINUTE
  ) {
    return await finishSilently("RATE_LIMITED");
  }
  // While a human has the conversation the bot stays out of it entirely: it
  // must not run tools (e.g. create a cart) whose answer nobody will see.
  if (
    identity.handoff_state === "HUMAN" &&
    !["STOP", "START", "RESUME_BOT"].includes(intent.name)
  ) {
    return await finishSilently("HUMAN_HANDOFF");
  }

  let current: IdentityView = identity;
  let reply: string;
  let bypassPolicy = false;

  switch (intent.name) {
    case "STOP":
      await service.setConsent({
        identity_id: identity.id,
        status: "OPTED_OUT",
      });
      reply = t("stop", locale);
      bypassPolicy = true; // confirm the opt-out itself
      break;
    case "START":
      await service.setConsent({
        identity_id: identity.id,
        status: "OPTED_IN",
      });
      current = { ...identity, consent_status: "OPTED_IN" };
      reply = t("start", locale);
      break;
    case "MUTE":
    case "UNMUTE":
      await service.setCategoryMuted({
        identity_id: identity.id,
        category: intent.category,
        muted: intent.name === "MUTE",
      });
      reply = t(intent.name === "MUTE" ? "muted" : "unmuted", locale);
      bypassPolicy = true; // confirm the preference itself
      break;
    case "RESUME_BOT":
      await service.setHandoff({
        identity_id: identity.id,
        state: "BOT",
        actor_id: "system:customer",
      });
      current = { ...identity, handoff_state: "BOT" };
      reply = t("botBack", locale);
      break;
    case "HANDOFF":
      await service.setHandoff({
        identity_id: identity.id,
        state: "HUMAN",
        actor_id: "system:bot",
      });
      reply = t("handoff", locale);
      bypassPolicy = true; // acknowledge before going silent
      break;
    case "LINK": {
      // A redelivered LINK message whose identity is already linked means the
      // first attempt consumed the code but its reply could not be sent. The
      // code is single-use, so running it again would answer "invalid" and
      // count a failed attempt toward the lockout.
      if (recorded.duplicate && identity.customer_id) {
        reply = t("linked", locale);
        break;
      }
      const result = await service.consumeLinkCode({
        identity_id: identity.id,
        code: intent.code,
      });
      if (result.status === "LINKED") {
        // Linking proves ownership and is the opt-in for transactional
        // updates, but it must never override an explicit opt-out.
        const optIn = identity.consent_status === "UNKNOWN";
        if (optIn) {
          await service.setConsent({
            identity_id: identity.id,
            status: "OPTED_IN",
          });
        }
        current = {
          ...identity,
          customer_id: result.customer_id ?? null,
          consent_status: optIn ? "OPTED_IN" : identity.consent_status,
        };
        reply = t("linked", locale);
      } else {
        reply = t(
          result.status === "LOCKED" ? "linkLocked" : "linkInvalid",
          locale
        );
      }
      break;
    }
    case "ORDER":
    case "TRACKING":
    case "PRODUCTION": {
      if (!deps.flags.readTools) {
        reply = t("toolsDisabled", locale);
        break;
      }
      if (!identity.customer_id) {
        reply = t("needLink", locale);
        break;
      }
      const order = await readers.findOrder(identity.customer_id, intent.ref);
      if (!order) {
        reply = intent.ref ? t("orderNotFound", locale) : t("askOrder", locale);
        break;
      }
      if (intent.name === "ORDER") {
        reply = orderText(order, locale);
      } else if (intent.name === "TRACKING") {
        const shipments = await readers.shipmentsForOrder(order.id);
        reply = shipments.length
          ? shipments.map((s) => shipmentText(s, locale)).join(" ")
          : locale === "vi"
            ? "Đơn hàng chưa có thông tin vận chuyển."
            : "This order has no shipment yet.";
      } else {
        const status = await readers.productionStatusForOrder(order.id);
        reply = status
          ? productionText(status, locale)
          : locale === "vi"
            ? "Đơn hàng này không cần sản xuất theo yêu cầu."
            : "This order isn't made to order.";
      }
      break;
    }
    case "PRODUCT_SEARCH": {
      if (!deps.flags.readTools) {
        reply = t("toolsDisabled", locale);
        break;
      }
      const hits = (await readers.searchProducts(intent.query)).slice(
        0,
        MAX_SEARCH_HITS
      );
      reply = hits.length
        ? hits.map((h) => `${h.title}${h.sku ? ` (${h.sku})` : ""}`).join("; ")
        : t("searchEmpty", locale);
      break;
    }
    case "CHECKOUT": {
      if (!deps.flags.stateChange) {
        reply = t("toolsDisabled", locale);
        break;
      }
      if (!identity.customer_id) {
        reply = t("needLink", locale);
        break;
      }
      const link = await readers.createCheckoutLink(
        identity.customer_id,
        intent.sku,
        intent.qty
      );
      reply = link ?? t("searchEmpty", locale);
      break;
    }
    default:
      reply = t("help", locale);
  }

  const decision = bypassPolicy
    ? ({ allow: true } as const)
    : evaluateOutbound({
        identity: current,
        kind: "REPLY",
        now,
        notificationsLastHour: 0,
      });
  if (!decision.allow) {
    await service.recordOutbound({
      identity_id: identity.id,
      text: reply,
      status: "SKIPPED",
      error: decision.reason,
    });
    await service.markInboundProcessed({
      identity_id: identity.id,
      message_id: inbound.message_id,
    });
    return {
      status: "SUPPRESSED",
      reason: decision.reason,
      intent: intent.name,
    };
  }

  try {
    await channel.send({
      account_id: inbound.account_id,
      recipient_id: inbound.external_user_id,
      text: reply,
      kind: "RESPONSE",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ChannelError && error.kind === "RETRYABLE") {
      // Leave the inbound RECEIVED so the inbox retry sends the reply.
      throw error;
    }
    await service.recordOutbound({
      identity_id: identity.id,
      text: reply,
      status: "FAILED",
      error: message,
    });
    await service.markInboundProcessed({
      identity_id: identity.id,
      message_id: inbound.message_id,
    });
    return { status: "SUPPRESSED", reason: "SEND_FAILED", intent: intent.name };
  }
  await service.recordOutbound({
    identity_id: identity.id,
    text: reply,
    status: "SENT",
  });
  await service.markInboundProcessed({
    identity_id: identity.id,
    message_id: inbound.message_id,
  });
  // The customer is reachable again: send what was waiting for the window.
  await flushDeferredNotifications(
    { service, channel, now: deps.now },
    current
  );
  return { status: "REPLIED", reply, intent: intent.name };
};
