import { MedusaError } from "@medusajs/framework/utils";

import { getMessageChannel } from "../../integrations/channel/registry";
import { domainError, ErrorCodes } from "../../lib/errors";
import { SOCIAL_COMMERCE_MODULE } from "../../modules/socialCommerce";
import { evaluateAgentReply } from "../../modules/socialCommerce/lib/policy";
import type SocialCommerceModuleService from "../../modules/socialCommerce/service";
import { wrapStep, type Resolver } from "./wrap";

const social = (c: Resolver) =>
  c.resolve<SocialCommerceModuleService>(SOCIAL_COMMERCE_MODULE);

export const createLinkCodeStep = wrapStep(
  "social-create-link-code",
  (i: { customer_id: string }, c) => social(c).createLinkCode(i.customer_id)
);

export const setHandoffStep = wrapStep(
  "social-set-handoff",
  (i: { identity_id: string; state: "BOT" | "HUMAN"; actor_id: string }, c) =>
    social(c).setHandoff(i)
);

/**
 * A support agent answers a customer who was handed off (FR-SOC-009). The same
 * policy as the bot applies: no opted-out customers, and only inside the
 * messaging window; the conversation must be in human mode so the bot and the
 * agent never talk at once.
 */
export const sendAgentMessageStep = wrapStep(
  "social-send-agent-message",
  async (i: { identity_id: string; text: string; actor_id: string }, c) => {
    const service = social(c);
    const identity = await service.getIdentity(i.identity_id);
    if (!identity) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Conversation not found"
      );
    }
    const decision = evaluateAgentReply(identity, new Date());
    if (!decision.allow) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `The reply cannot be sent: ${decision.reason}`
      );
    }
    await getMessageChannel(identity.channel).send({
      account_id: identity.account_id,
      recipient_id: identity.external_user_id,
      text: i.text,
      kind: "RESPONSE",
    });
    await service.recordOutbound({
      identity_id: identity.id,
      text: i.text,
      status: "SENT",
    });
    return { identity_id: identity.id, sent: true as const };
  }
);
