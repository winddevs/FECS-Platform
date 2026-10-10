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

export const MAX_OUTBOX_ATTEMPTS = 10;
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

/**
 * Claims a batch with FOR UPDATE SKIP LOCKED so multiple publishers can run
 * concurrently without double-publishing, then publishes and marks each row.
 * Must run inside a transaction.
 */
export const drainOutbox = async (
  executor: SqlExecutor,
  tableName: string,
  limit: number,
  publish: OutboxPublishFn
): Promise<DrainResult> => {
  const table = safeTable(tableName);
  const rows = await executor.execute<ClaimedOutboxRow>(
    `SELECT id, event_id, event_type, topic, partition_key, payload, attempts
     FROM ${table}
     WHERE status = 'PENDING' AND available_at <= now() AND deleted_at IS NULL
     ORDER BY created_at, id
     LIMIT ?
     FOR UPDATE SKIP LOCKED`,
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
      const exhausted = nextAttempts >= MAX_OUTBOX_ATTEMPTS;
      await executor.execute(
        `UPDATE ${table}
         SET status = ?, attempts = ?, last_error = ?,
             available_at = now() + (? || ' seconds')::interval, updated_at = now()
         WHERE id = ?`,
        [
          exhausted ? "FAILED" : "PENDING",
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
