import type { IEventBusModuleService } from "@medusajs/framework/types";

import type { OutboxPublishFn } from "./outbox";

/**
 * Port for the integration backbone (ADR-006). The default adapter publishes
 * to Medusa's event bus (Redis-backed in production) so internal subscribers
 * can react. A Kafka adapter implementing the same function type can replace
 * it without touching any domain module: partition by `partition_key`, topic
 * from `topic`, and use `event_id` as the message key for consumer dedup.
 */
export const createEventBusPublisher =
  (eventBus: IEventBusModuleService): OutboxPublishFn =>
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
  };
