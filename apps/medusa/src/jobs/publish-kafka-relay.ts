import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { isEnabled } from "../lib/feature-flags";
import {
  createKafkaRestBatchPublisher,
  kafkaRestConfigFromEnv,
} from "../lib/outbox/kafka-rest";
import { INTEGRATION_MODULE } from "../modules/integration";
import type IntegrationModuleService from "../modules/integration/service";

const BATCH_SIZE = 200;
/** One drain at a time per process: a slow broker must not pile up transactions. */
let running = false;

/**
 * Delivers the Kafka relay queue. Rows are claimed with SKIP LOCKED and an
 * aggregate's events leave in order, like the domain outboxes. A Kafka outage
 * only grows the queue (NFR-AVL-003); it is delivered when Kafka is back.
 */
export default async function publishKafkaRelay(
  container: MedusaContainer
): Promise<void> {
  const config = kafkaRestConfigFromEnv();
  if (!(isEnabled("KAFKA_RELAY_ENABLED") && config)) {
    return;
  }
  if (running) {
    return;
  }
  running = true;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const { published, failed } = await container
      .resolve<IntegrationModuleService>(INTEGRATION_MODULE)
      .publishKafkaRelay(BATCH_SIZE, createKafkaRestBatchPublisher(config));
    if (failed > 0) {
      logger.warn(`[kafka-relay] published=${published} failed=${failed}`);
    }
  } catch (error) {
    logger.error(
      `[kafka-relay] drain failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    running = false;
  }
}

export const config = {
  name: "publish-kafka-relay",
  schedule: "*/2 * * * * *",
};
