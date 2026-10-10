import type { Context, DAL } from "@medusajs/framework/types";
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
  generateEntityId,
} from "@medusajs/framework/utils";

import { safeTable, type SqlExecutor } from "../../lib/sql";
import { AuditLog } from "./models/audit-log";
import { InboxEvent } from "./models/inbox-event";

export type ReceiveInboxInput = {
  provider: string;
  external_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
};

export type ReceiveInboxResult = { id: string; duplicate: boolean };

export type RecordAuditInput = {
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlation_id?: string | null;
};

const INBOX_TABLE = safeTable("inbox_event");
const MAX_INBOX_ATTEMPTS = 8;

class IntegrationModuleService extends MedusaService({
  InboxEvent,
  AuditLog,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    // eslint-disable-next-line prefer-rest-params
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  /**
   * Durable, deduplicated ingestion. Webhook handlers call this and ACK
   * immediately; processing happens asynchronously.
   */
  @InjectTransactionManager()
  async receiveInboxEvent(
    input: ReceiveInboxInput,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<ReceiveInboxResult> {
    const executor = sharedContext.transactionManager as unknown as SqlExecutor;
    const id = generateEntityId(undefined, "inbx");

    const inserted = await executor.execute<{ id: string }>(
      `INSERT INTO ${INBOX_TABLE}
         (id, provider, external_event_id, event_type, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?::jsonb, 'RECEIVED', 0, now(), now())
       ON CONFLICT (provider, external_event_id) WHERE deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [
        id,
        input.provider,
        input.external_event_id,
        input.event_type,
        JSON.stringify(input.payload),
      ]
    );
    if (inserted.length > 0) {
      return { id, duplicate: false };
    }

    const [existing] = await executor.execute<{ id: string }>(
      `SELECT id FROM ${INBOX_TABLE}
       WHERE provider = ? AND external_event_id = ? AND deleted_at IS NULL`,
      [input.provider, input.external_event_id]
    );
    return { id: existing?.id ?? id, duplicate: true };
  }

  /** Claims a batch of events to process; safe for concurrent workers. */
  @InjectTransactionManager()
  async claimInboxBatch(
    limit: number,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<
    Array<{
      id: string;
      provider: string;
      event_type: string;
      payload: Record<string, unknown>;
      attempts: number;
    }>
  > {
    const executor = sharedContext.transactionManager as unknown as SqlExecutor;
    const rows = await executor.execute<{
      id: string;
      provider: string;
      event_type: string;
      payload: Record<string, unknown>;
      attempts: number;
    }>(
      `SELECT id, provider, event_type, payload, attempts FROM ${INBOX_TABLE}
       WHERE (
           (status IN ('RECEIVED', 'RETRY') AND (next_retry_at IS NULL OR next_retry_at <= now()))
           -- visibility timeout: a worker that died mid-batch leaves PROCESSING rows behind
           OR (status = 'PROCESSING' AND updated_at < now() - interval '5 minutes')
         )
         AND deleted_at IS NULL
       ORDER BY created_at, id
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    if (rows.length > 0) {
      await executor.execute(
        `UPDATE ${INBOX_TABLE} SET status = 'PROCESSING', updated_at = now() WHERE id IN (?)`,
        [rows.map((r) => r.id)]
      );
    }
    return rows;
  }

  @InjectTransactionManager()
  async markInboxProcessed(
    id: string,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const executor = sharedContext.transactionManager as unknown as SqlExecutor;
    await executor.execute(
      `UPDATE ${INBOX_TABLE}
       SET status = 'PROCESSED', processed_at = now(), last_error = NULL, updated_at = now()
       WHERE id = ?`,
      [id]
    );
  }

  /** Schedules a retry with exponential backoff, or moves the event to DLQ. */
  @InjectTransactionManager()
  async markInboxFailed(
    id: string,
    error: string,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<{ status: "RETRY" | "DLQ" }> {
    const executor = sharedContext.transactionManager as unknown as SqlExecutor;
    const [row] = await executor.execute<{ attempts: number }>(
      `SELECT attempts FROM ${INBOX_TABLE} WHERE id = ? FOR UPDATE`,
      [id]
    );
    const attempts = (row?.attempts ?? 0) + 1;
    const status = attempts >= MAX_INBOX_ATTEMPTS ? "DLQ" : "RETRY";
    const delaySeconds = Math.min(2 ** attempts, 600);
    await executor.execute(
      `UPDATE ${INBOX_TABLE}
       SET status = ?, attempts = ?, last_error = ?,
           next_retry_at = now() + (? || ' seconds')::interval, updated_at = now()
       WHERE id = ?`,
      [status, attempts, error.slice(0, 1000), String(delaySeconds), id]
    );
    return { status };
  }

  async recordAudit(input: RecordAuditInput) {
    return await this.createAuditLogs({
      actor_id: input.actor_id,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      reason: input.reason ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      correlation_id: input.correlation_id ?? null,
    });
  }
}

export default IntegrationModuleService;
