import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

import {
  OUTBOX_MODULES,
  type OutboxModuleService,
} from "../lib/outbox/drainers";
import { createEventBusPublisher } from "../lib/outbox/publisher";

const BATCH_SIZE = 100;

/**
 * Drains every domain outbox. Safe to run on many workers at once: rows are
 * claimed with FOR UPDATE SKIP LOCKED. Failures back off per event and never
 * block committed domain transactions (NFR-AVL-003).
 */
export default async function publishOutbox(
  container: MedusaContainer
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const publish = createEventBusPublisher(container.resolve(Modules.EVENT_BUS));

  for (const name of OUTBOX_MODULES) {
    try {
      const service = container.resolve<OutboxModuleService>(name);
      const { published, failed } = await service.publishOutbox(
        BATCH_SIZE,
        publish
      );
      if (failed > 0) {
        logger.warn(`[outbox:${name}] published=${published} failed=${failed}`);
      }
    } catch (error) {
      logger.error(
        `[outbox:${name}] drain failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const config = {
  name: "publish-outbox",
  schedule: "*/2 * * * * *",
};
