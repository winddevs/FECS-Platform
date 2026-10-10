import { model } from "@medusajs/framework/utils";

export const INBOX_STATUSES = [
  "RECEIVED",
  "PROCESSING",
  "PROCESSED",
  "RETRY",
  "DLQ",
] as const;

/**
 * Durable inbox for external webhooks/events (TDD section 35).
 * Unique on (provider, external_event_id) - providers lacking an event ID must
 * supply a deterministic hash of the payload.
 */
export const InboxEvent = model
  .define("inbox_event", {
    id: model.id({ prefix: "inbx" }).primaryKey(),
    provider: model.text(),
    external_event_id: model.text(),
    event_type: model.text(),
    payload: model.json(),
    status: model.enum([...INBOX_STATUSES]).default("RECEIVED"),
    attempts: model.number().default(0),
    next_retry_at: model.dateTime().nullable(),
    processed_at: model.dateTime().nullable(),
    last_error: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_inbox_event_provider_external_unique",
      on: ["provider", "external_event_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_inbox_event_status_retry",
      on: ["status", "next_retry_at"],
      where: "deleted_at IS NULL",
    },
  ]);
