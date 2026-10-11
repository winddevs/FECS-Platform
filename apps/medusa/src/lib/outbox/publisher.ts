import type { IEventBusModuleService } from "@medusajs/framework/types";

import type { OutboxPublishFn } from "./outbox";

type RelayQueue = {
  enqueueKafkaRelay: (row: Parameters<OutboxPublishFn>[0]) => Promise<void>;
};

/**
 * Port for the integration backbone (ADR-006). The default adapter publishes
 * to Medusa's event bus (Redis-backed in production) so internal subscribers
 * can react. When a relay queue is given (KAFKA_RELAY_ENABLED), every event
 * that reached the bus is also queued for Kafka in the same call; a separate
 * job then delivers the queue to Kafka (see publish-kafka-relay), so Kafka
 * trouble never delays internal subscribers. Consumers deduplicate on
 * `event_id`, the relay is idempotent on it.
 */
export const createEventBusPublisher =
  (
    eventBus: IEventBusModuleService,
    relay?: RelayQueue | null
  ): OutboxPublishFn =>
  async (row) => {
    await eventBus.emit({
      name: row.event_type,
      data: row.payload,
      metadata: {
        topic: row.topic,
        partition_key: row.partition_key,
        event_id: row.event_id,
      },
    });
    if (relay) {
      await relay.enqueueKafkaRelay(row);
    }
  };
