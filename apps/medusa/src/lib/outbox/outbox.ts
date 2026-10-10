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

const drainRound = async (
  executor: SqlExecutor,
  tableName: string,
  limit: number,
  publish: OutboxPublishFn
): Promise<DrainResult> => {
  const table = safeTable(tableName);
  const rows = await executor.execute<ClaimedOutboxRow>(
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

  const result: DrainResult = { published: 0, failed: 0 };
  for (const row of rows) {
    try {
      await publish(row);
      await executor.execute(
        `UPDATE ${table}
         SET status = 'PUBLISHED', published_at = now(), attempts = attempts + 1,
             last_error = NULL, updated_at = now()
         WHERE id = ?`,
        [row.id]
      );
      result.published += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempts = row.attempts + 1;
      // The only failure here is the transport (event bus) being unavailable.
      // Giving up would silently drop business events after a ~10 minute
      // outage, so rows stay PENDING with a capped backoff and the attempts
      // counter feeds an alert. FAILED is reserved for operators who park a
      // poison event by hand.
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
      result.failed += 1;
    }
  }
  return result;
};

export const newId = (prefix: string): string =>
  generateEntityId(undefined, prefix);
