import { OpenAiCompatibleAgentModel } from "../../../integrations/agent/openai-compatible";
import { getMessageChannel } from "../../../integrations/channel/registry";
import { SOCIAL_COMMERCE_MODULE } from "../../../modules/socialCommerce";
import type { Locale } from "../../../modules/socialCommerce/lib/messages";
import type SocialCommerceModuleService from "../../../modules/socialCommerce/service";
import { isEnabled } from "../../feature-flags";
import { handleInboundMessage } from "../../social/handle-inbound";
import { createMedusaReaders } from "../../social/medusa-readers";
import type { InboxHandler } from "../registry";

export const socialLocale = (env: NodeJS.ProcessEnv = process.env): Locale =>
  env.SOCIAL_DEFAULT_LOCALE === "en" ? "en" : "vi";

/** Processes one Messenger message that was stored (and deduped) in the inbox. */
export const handleMetaInboxEvent: InboxHandler = async (container, event) => {
  if (!isEnabled("META_MESSENGER_ENABLED")) {
    return; // flag off: leave the event consumed but unanswered
  }
  const payload = event.payload as {
    channel: string;
    account_id: string;
    external_user_id: string;
    message_id: string;
    text: string;
    occurred_at: string;
  };
  await handleInboundMessage(
    {
      service: container.resolve<SocialCommerceModuleService>(
        SOCIAL_COMMERCE_MODULE
      ),
      channel: getMessageChannel(payload.channel),
      readers: createMedusaReaders(container),
      locale: socialLocale(),
      flags: {
        readTools: isEnabled("AGENT_READ_TOOLS_ENABLED"),
        stateChange: isEnabled("AGENT_STATE_CHANGE_ENABLED"),
      },
      agent: isEnabled("AGENT_LLM_ENABLED")
        ? OpenAiCompatibleAgentModel.fromEnv()
        : null,
    },
    { ...payload, occurred_at: new Date(payload.occurred_at) }
  );
};
