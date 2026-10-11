/**
 * Retention policy for operational (non-ledger) tables. Business ledgers
 * (stock movements, FG movements, audit log) are append-only and kept; these
 * tables only exist to make delivery reliable, so they are pruned to keep the
 * hot path small as volume grows.
 */
export type RetentionRule = {
  table: string;
  /** SQL condition on the row (must be selective and indexed or small). */
  condition: string;
  days: number;
};

export const OUTBOX_TABLES = [
  "material_inventory_outbox_event",
  "procurement_outbox_event",
  "manufacturing_outbox_event",
  "quality_outbox_event",
  "finished_goods_outbox_event",
  "fulfillment_outbox_event",
  "social_outbox_event",
  "returns_outbox_event",
  "kafka_relay_event",
] as const;

export const IDEMPOTENCY_TABLES = [
  "material_inventory_idempotency_record",
  "procurement_idempotency_record",
  "manufacturing_idempotency_record",
  "quality_idempotency_record",
  "finished_goods_idempotency_record",
  "fulfillment_idempotency_record",
  "social_idempotency_record",
  "returns_idempotency_record",
] as const;

const days = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const retentionRules = (
  env: NodeJS.ProcessEnv = process.env
): RetentionRule[] => [
  // Published events were already delivered; FAILED ones are kept for forensics.
  ...OUTBOX_TABLES.map((table) => ({
    table,
    condition: "status = 'PUBLISHED'",
    days: days(env.RETENTION_OUTBOX_DAYS, 14),
  })),
  // A key older than the client retry window can never be replayed.
  ...IDEMPOTENCY_TABLES.map((table) => ({
    table,
    condition: "TRUE",
    days: days(env.RETENTION_IDEMPOTENCY_DAYS, 30),
  })),
  {
    table: "inbox_event",
    condition: "status = 'PROCESSED'",
    days: days(env.RETENTION_INBOX_DAYS, 30),
  },
  {
    table: "conversation_message",
    condition: "TRUE",
    days: days(env.RETENTION_MESSAGE_DAYS, 90),
  },
  {
    table: "notification_log",
    condition: "TRUE",
    days: days(env.RETENTION_NOTIFICATION_DAYS, 90),
  },
];
