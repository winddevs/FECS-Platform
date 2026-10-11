import { model } from "@medusajs/framework/utils";

import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";

export const SOCIAL_OUTBOX_TABLE = "social_outbox_event";
export const SOCIAL_IDEMPOTENCY_TABLE = "social_idempotency_record";
export const SocialOutboxEvent = defineOutboxEventModel(SOCIAL_OUTBOX_TABLE);
export const SocialIdempotencyRecord = defineIdempotencyRecordModel(
  SOCIAL_IDEMPOTENCY_TABLE
);

export const CONSENT_STATUSES = ["UNKNOWN", "OPTED_IN", "OPTED_OUT"] as const;
export const HANDOFF_STATES = ["BOT", "HUMAN"] as const;

/**
 * Channel identity (TDD s.26): (channel, account, external user) -> customer.
 * A PSID is page-scoped, so it is never treated as a global customer id.
 */
export const CustomerChannelIdentity = model
  .define("customer_channel_identity", {
    id: model.id({ prefix: "chid" }).primaryKey(),
    channel: model.text(),
    account_id: model.text(),
    external_user_id: model.text(),
    customer_id: model.text().nullable(),
    consent_status: model.enum([...CONSENT_STATUSES]).default("UNKNOWN"),
    handoff_state: model.enum([...HANDOFF_STATES]).default("BOT"),
    last_inbound_at: model.dateTime().nullable(),
    failed_link_attempts: model.number().default(0),
    link_locked_until: model.dateTime().nullable(),
    /** Notification categories the customer switched off (FR-NOT-002). */
    muted_categories: model.json().nullable(),
    /** Language the customer writes in (`vi` | `en`), learned from messages. */
    locale: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_channel_identity_unique",
      on: ["channel", "account_id", "external_user_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_channel_identity_customer", on: ["customer_id"] },
  ]);

/** One-time code a logged-in customer sends to link their Messenger identity. */
export const ChannelLinkCode = model
  .define("channel_link_code", {
    id: model.id({ prefix: "lnk" }).primaryKey(),
    code_hash: model.text(),
    customer_id: model.text(),
    expires_at: model.dateTime(),
    used_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_channel_link_code_hash_unique",
      on: ["code_hash"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

/** Message content is PII: it is truncated and access-controlled (NFR-SEC-003). */
export const ConversationMessage = model
  .define("conversation_message", {
    id: model.id({ prefix: "msg" }).primaryKey(),
    identity_id: model.text(),
    direction: model.enum(["IN", "OUT"]),
    external_message_id: model.text().nullable(),
    text: model.text().nullable(),
    intent: model.text().nullable(),
    status: model
      .enum(["RECEIVED", "PROCESSED", "SENT", "FAILED", "SKIPPED"])
      .default("RECEIVED"),
    error: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_conversation_message_external_unique",
      on: ["identity_id", "direction", "external_message_id"],
      unique: true,
      where: "deleted_at IS NULL AND external_message_id IS NOT NULL",
    },
    {
      name: "IDX_conversation_message_identity",
      on: ["identity_id", "created_at"],
    },
  ]);

export const NotificationLog = model
  .define("notification_log", {
    id: model.id({ prefix: "ntf" }).primaryKey(),
    identity_id: model.text(),
    dedupe_key: model.text(),
    event_type: model.text(),
    status: model
      .enum(["PENDING", "SENT", "SKIPPED", "FAILED", "DEFERRED"])
      .default("PENDING"),
    reason: model.text().nullable(),
    /**
     * Message body kept while the notification waits (DEFERRED) for the
     * messaging window to reopen or for a retry after a channel outage.
     */
    text: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_notification_log_dedupe_unique",
      on: ["identity_id", "dedupe_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_notification_log_rate", on: ["identity_id", "created_at"] },
  ]);
