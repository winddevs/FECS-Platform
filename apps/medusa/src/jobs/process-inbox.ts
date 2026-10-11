import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { registerInboxHandlers } from "../lib/inbox/bootstrap";
import { inboxHandlerFor } from "../lib/inbox/registry";
import { withCausation } from "../lib/observability/causation";
import { INTEGRATION_MODULE } from "../modules/integration";
import type IntegrationModuleService from "../modules/integration/service";

const BATCH_SIZE = 50;

/**
 * Drains the durable inbox (TDD s.35): RECEIVED/RETRY -> PROCESSED, with
 * exponential backoff and a DLQ after repeated failures. Safe on many
 * workers: claiming uses FOR UPDATE SKIP LOCKED.
 */
export default async function processInbox(
  container: MedusaContainer
): Promise<void> {
  registerInboxHandlers();
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const integration =
    container.resolve<IntegrationModuleService>(INTEGRATION_MODULE);

  const batch = await integration.claimInboxBatch(BATCH_SIZE);
  for (const event of batch) {
    const handler = inboxHandlerFor(event.provider);
    if (!handler) {
      await integration.markInboxFailed(
        event.id,
        `no handler for provider ${event.provider}`
      );
      continue;
    }
    try {
      // Events produced while handling a webhook name that webhook as their cause.
      await withCausation(`inbox:${event.id}`, () => handler(container, event));
      await integration.markInboxProcessed(event.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { status } = await integration.markInboxFailed(event.id, message);
      logger.warn(
        `[inbox:${event.provider}] ${event.id} -> ${status}: ${message.slice(0, 200)}`
      );
    }
  }
}

export const config = {
  name: "process-inbox",
  schedule: "*/2 * * * * *",
};
