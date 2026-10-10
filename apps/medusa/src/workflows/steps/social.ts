import { SOCIAL_COMMERCE_MODULE } from "../../modules/socialCommerce";
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
