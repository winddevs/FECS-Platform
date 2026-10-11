import { randomUUID } from "node:crypto";

import { currentCausation } from "../observability/causation";

/**
 * Canonical event envelope (TDD section 37).
 * Consumers deduplicate by `event_id`.
 */
export type EventEnvelope<TData = Record<string, unknown>> = {
  event_id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  occurred_at: string;
  correlation_id: string;
  causation_id: string | null;
  producer: string;
  data: TData;
};

export type BuildEnvelopeInput<TData> = {
  eventType: string;
  eventVersion?: number;
  aggregateType: string;
  aggregateId: string;
  producer: string;
  correlationId?: string | null;
  causationId?: string | null;
  data: TData;
};

let lastOccurredMs = 0;
/**
 * Strictly increasing per process. Events of one aggregate written in one
 * transaction share `created_at`, so their order is decided by `occurred_at`;
 * two events in the same millisecond must not tie.
 */
const nextOccurredAt = (): string => {
  const now = Date.now();
  lastOccurredMs = now > lastOccurredMs ? now : lastOccurredMs + 1;
  return new Date(lastOccurredMs).toISOString();
};
export const buildEnvelope = <TData extends Record<string, unknown>>(
  input: BuildEnvelopeInput<TData>
): EventEnvelope<TData> => ({
  event_id: `evt_${randomUUID()}`,
  event_type: input.eventType,
  event_version: input.eventVersion ?? 1,
  aggregate_type: input.aggregateType,
  aggregate_id: input.aggregateId,
  occurred_at: nextOccurredAt(),
  correlation_id: input.correlationId ?? `cor_${randomUUID()}`,
  causation_id: input.causationId ?? currentCausation(),
  producer: input.producer,
  data: input.data,
});

/** Kafka topic names per domain (TDD section 38). */
export const TOPICS = {
  procurement: "fashion.procurement.events.v1",
  inventory: "fashion.inventory.events.v1",
  manufacturing: "fashion.manufacturing.events.v1",
  quality: "fashion.quality.events.v1",
  finishedGoods: "fashion.finished-goods.events.v1",
  commerce: "fashion.commerce.events.v1",
  fulfillment: "fashion.fulfillment.events.v1",
  notification: "fashion.notification.events.v1",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
