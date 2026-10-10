import type { Context } from "@medusajs/framework/types";

import { buildEnvelope, type Topic } from "./events/envelope";
import { beginIdempotent, completeIdempotent } from "./idempotency/guard";
import { toOutboxRow, type OutboxRowInput } from "./outbox/outbox";
import type { SqlExecutor } from "./sql";

/**
 * Small helpers shared by transactional domain services. They operate on the
 * transaction manager Medusa injects through `@InjectTransactionManager()`.
 */
export const executorOf = (ctx: Context): SqlExecutor =>
  ctx.transactionManager as unknown as SqlExecutor;

/** ORM writes are buffered; flush before raw SQL that must see them. */
export const flushOf = async (ctx: Context): Promise<void> => {
  await (
    ctx.transactionManager as unknown as { flush: () => Promise<void> }
  ).flush();
};

export type Command = {
  actor_id: string;
  correlation_id?: string | null;
  idempotency_key: string;
};

/** Runs `fn` once per (scope, key); duplicates replay the stored response. */
export const runIdempotent = async <T>(
  ctx: Context,
  table: string,
  scope: string,
  input: Command,
  fn: () => Promise<T>
): Promise<T> => {
  const {
    idempotency_key: key,
    correlation_id: _correlation,
    ...payload
  } = input;
  const ex = executorOf(ctx);
  const begin = await beginIdempotent<T>(ex, table, scope, key, payload);
  if (begin.replay) {
    return begin.response;
  }
  const result = await fn();
  await completeIdempotent(ex, table, begin.recordId, result);
  return result;
};

export type EventSpec = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  producer: string;
  topic: Topic;
  actor: { actor_id: string; correlation_id?: string | null };
  data: Record<string, unknown>;
};

export const outboxRowFor = (spec: EventSpec): OutboxRowInput =>
  toOutboxRow(
    buildEnvelope({
      eventType: spec.eventType,
      aggregateType: spec.aggregateType,
      aggregateId: spec.aggregateId,
      producer: spec.producer,
      correlationId: spec.actor.correlation_id,
      data: { ...spec.data, actor_id: spec.actor.actor_id },
    }),
    spec.topic
  );

/** Locks rows by id (sorted, deterministic) and returns them keyed by id. */
export const lockRows = async <T extends { id: string }>(
  ctx: Context,
  table: string,
  columns: string,
  ids: string[]
): Promise<Map<string, T>> => {
  const unique = [...new Set(ids)].sort();
  const out = new Map<string, T>();
  if (unique.length === 0) {
    return out;
  }
  const rows = await executorOf(ctx).execute<T>(
    `SELECT ${columns} FROM "${table}" WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
    [unique]
  );
  for (const row of rows) {
    out.set(row.id, row);
  }
  return out;
};
