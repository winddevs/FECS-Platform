import { generateEntityId } from "@medusajs/framework/utils";

import type { EventEnvelope } from "../events/envelope";
import { safeTable, type SqlExecutor } from "../sql";

export type OutboxRowInput = {
  event_id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  status: "PENDING";
  available_at: Date;
};

/** Builds the row to insert next to the domain write (same transaction). */
export const toOutboxRow = (
  envelope: EventEnvelope,
  topic: string
): OutboxRowInput => ({
  event_id: envelope.event_id,
  event_type: envelope.event_type,
  event_version: envelope.event_version,
  aggregate_type: envelope.aggregate_type,
  aggregate_id: envelope.aggregate_id,
  topic,
  // Partition by aggregate ID so per-aggregate ordering is preserved.
  partition_key: envelope.aggregate_id,
  payload: envelope as unknown as Record<string, unknown>,
  status: "PENDING",
  available_at: new Date(),
});

export type ClaimedOutboxRow = {
  id: string;
  event_id: string;
  event_type: string;
  topic: string;
  partition_key: string;
  payload: EventEnvelope;
  attempts: number;
};

export type OutboxPublishFn = (row: ClaimedOutboxRow) => Promise<void>;

/** Attempts after which an operator alert fires; the row keeps retrying. */
export const OUTBOX_ALERT_ATTEMPTS = 10;
const BASE_BACKOFF_SECONDS = 2;
const MAX_BACKOFF_SECONDS = 300;

export const backoffSeconds = (attempts: number): number => {
  const exp = Math.min(
    BASE_BACKOFF_SECONDS * 2 ** attempts,
    MAX_BACKOFF_SECONDS
  );
  // Full jitter, never below 1s.
  return Math.max(1, Math.round(Math.random() * exp));
};

export type DrainResult = { published: number; failed: number };

/** Rounds per drain: each round releases the next event of every aggregate. */
const MAX_DRAIN_ROUNDS = 20;

/**
 * Claims batches with FOR UPDATE SKIP LOCKED so multiple publishers can run
 * concurrently without double-publishing, then publishes and marks each row.
 * Because only the oldest pending event of an aggregate is claimable, an
 * aggregate with several events needs several rounds; they run in the same
 * transaction (published rows are visible to the next round). Must run inside
 * a transaction.
 */
export const drainOutbox = async (
  executor: SqlExecutor,
  tableName: string,
  limit: number,
  publish: OutboxPublishFn
): Promise<DrainResult> => {
  const total: DrainResult = { published: 0, failed: 0 };
  for (let round = 0; round < MAX_DRAIN_ROUNDS; round += 1) {
    const left = limit - total.published - total.failed;
    if (left <= 0) {
      break;
    }
    const part = await drainRound(executor, tableName, left, publish);
    total.published += part.published;
    total.failed += part.failed;
    if (part.published === 0) {
      break; // nothing claimable, or everything claimed failed and backs off
    }
  }
  return total;
};

/** An event is claimable only when no EARLIER event of its aggregate is pending. */
const claimRound = async (
  executor: SqlExecutor,
  table: string,
  limit: number
): Promise<ClaimedOutboxRow[]> =>
  await executor.execute<ClaimedOutboxRow>(
    // An event is claimable only when no EARLIER event of the same aggregate is
    // still pending (in flight or waiting out a backoff), so consumers see one
    // aggregate's events in the order they were written.
    `SELECT t.id, t.event_id, t.event_type, t.topic, t.partition_key, t.payload, t.attempts
     FROM ${table} t
     WHERE t.status = 'PENDING' AND t.available_at <= now() AND t.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM ${table} earlier
         WHERE earlier.aggregate_id = t.aggregate_id
           AND earlier.status = 'PENDING' AND earlier.deleted_at IS NULL
           AND (earlier.created_at, earlier.id) < (t.created_at, t.id)
       )
     ORDER BY t.created_at, t.id
     LIMIT ?
     FOR UPDATE OF t SKIP LOCKED`,
    [limit]
  );

const markPublished = async (
  executor: SqlExecutor,
  table: string,
  ids: string[]
): Promise<void> => {
  if (ids.length === 0) {
    return;
  }
  await executor.execute(
    `UPDATE ${table}
     SET status = 'PUBLISHED', published_at = now(), attempts = attempts + 1,
         last_error = NULL, updated_at = now()
     WHERE id IN (?)`,
    [ids]
  );
};

// The only failure here is the transport (event bus, Kafka) being unavailable.
// Giving up would silently drop business events after a ~10 minute outage, so
// rows stay PENDING with a capped backoff and the attempts counter feeds an
// alert. FAILED is reserved for operators who park a poison event by hand.
const markFailed = async (
  executor: SqlExecutor,
  table: string,
  row: ClaimedOutboxRow,
  error: unknown
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error);
  const nextAttempts = row.attempts + 1;
  await executor.execute(
    `UPDATE ${table}
     SET status = ?, attempts = ?, last_error = ?,
         available_at = now() + (? || ' seconds')::interval, updated_at = now()
     WHERE id = ?`,
    [
      "PENDING",
      nextAttempts,
      message.slice(0, 1000),
      String(backoffSeconds(nextAttempts)),
      row.id,
    ]
  );
};

const drainRound = async (
  executor: SqlExecutor,
  tableName: string,
  limit: number,
  publish: OutboxPublishFn
): Promise<DrainResult> => {
  const table = safeTable(tableName);
  const rows = await claimRound(executor, table, limit);
  const result: DrainResult = { published: 0, failed: 0 };
  for (const row of rows) {
    try {
      await publish(row);
      await markPublished(executor, table, [row.id]);
      result.published += 1;
    } catch (error) {
      await markFailed(executor, table, row, error);
      result.failed += 1;
    }
  }
  return result;
};

export type OutboxBatchPublishFn = (rows: ClaimedOutboxRow[]) => Promise<void>;

/**
 * Like drainOutbox, but hands each topic's claimed rows to the transport in ONE
 * call (a Kafka produce request carries many records). The groups of a round
 * are sent in parallel, and a round that had a failure ends the drain, so a
 * slow or unreachable broker holds the transaction for one timeout, not for
 * one timeout per event. Order inside a topic is the claim order.
 */
export const drainOutboxBatched = async (
  executor: SqlExecutor,
  tableName: string,
  limit: number,
  publishMany: OutboxBatchPublishFn
): Promise<DrainResult> => {
  const table = safeTable(tableName);
  const total: DrainResult = { published: 0, failed: 0 };
  for (let round = 0; round < MAX_DRAIN_ROUNDS; round += 1) {
    const left = limit - total.published - total.failed;
    if (left <= 0) {
      break;
    }
    const rows = await claimRound(executor, table, left);
    if (rows.length === 0) {
      break;
    }
    const groups = new Map<string, ClaimedOutboxRow[]>();
    for (const row of rows) {
      groups.set(row.topic, [...(groups.get(row.topic) ?? []), row]);
    }
    const outcomes = await Promise.allSettled(
      [...groups.values()].map(async (group) => {
        await publishMany(group);
        return group;
      })
    );
    let failedInRound = false;
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === "fulfilled") {
        await markPublished(
          executor,
          table,
          outcome.value.map((row) => row.id)
        );
        total.published += outcome.value.length;
        continue;
      }
      failedInRound = true;
      const group = [...groups.values()][index];
      for (const row of group) {
        await markFailed(executor, table, row, outcome.reason);
      }
      total.failed += group.length;
    }
    if (failedInRound) {
      break;
    }
  }
  return total;
};
export const newId = (prefix: string): string =>
  generateEntityId(undefined, prefix);
