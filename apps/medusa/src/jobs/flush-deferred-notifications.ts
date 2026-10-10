import type { MedusaContainer } from "@medusajs/framework/types";

import { getMessageChannel } from "../integrations/channel/registry";
import { isEnabled } from "../lib/feature-flags";
import { flushDeferredNotifications } from "../lib/social/notify";
import { SOCIAL_COMMERCE_MODULE } from "../modules/socialCommerce";
import type SocialCommerceModuleService from "../modules/socialCommerce/service";

const BATCH_SIZE = 50;

/**
 * Retries notifications that were deferred by a channel outage (or whose
 * messaging window has reopened) without waiting for the customer to write.
 */
export default async function flushDeferred(
  container: MedusaContainer
): Promise<void> {
  if (!isEnabled("META_MESSENGER_ENABLED")) {
    return;
  }
  const service = container.resolve<SocialCommerceModuleService>(
    SOCIAL_COMMERCE_MODULE
  );
  const channel = getMessageChannel();
  for (const identity of await service.identitiesWithDeferred(BATCH_SIZE)) {
    if (identity.channel === channel.code) {
      await flushDeferredNotifications({ service, channel }, identity);
    }
  }
}

export const config = {
  name: "flush-deferred-notifications",
  schedule: "*/5 * * * *",
};
