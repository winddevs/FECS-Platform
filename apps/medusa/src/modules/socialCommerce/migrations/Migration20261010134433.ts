import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010134433 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "social_outbox_event" drop constraint if exists "social_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "social_idempotency_record" drop constraint if exists "social_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `alter table if exists "notification_log" drop constraint if exists "notification_log_dedupe_unique";`
    );
    this.addSql(
      `alter table if exists "customer_channel_identity" drop constraint if exists "channel_identity_unique";`
    );
    this.addSql(
      `alter table if exists "conversation_message" drop constraint if exists "conversation_message_external_unique";`
    );
    this.addSql(
      `alter table if exists "channel_link_code" drop constraint if exists "channel_link_code_hash_unique";`
    );
    this.addSql(
      `create table if not exists "channel_link_code" ("id" text not null, "code_hash" text not null, "customer_id" text not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "channel_link_code_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_channel_link_code_deleted_at" ON "channel_link_code" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_channel_link_code_hash_unique" ON "channel_link_code" ("code_hash") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "conversation_message" ("id" text not null, "identity_id" text not null, "direction" text check ("direction" in ('IN', 'OUT')) not null, "external_message_id" text null, "text" text null, "intent" text null, "status" text check ("status" in ('RECEIVED', 'PROCESSED', 'SENT', 'FAILED', 'SKIPPED')) not null default 'RECEIVED', "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "conversation_message_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_conversation_message_deleted_at" ON "conversation_message" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_conversation_message_external_unique" ON "conversation_message" ("identity_id", "direction", "external_message_id") WHERE deleted_at IS NULL AND external_message_id IS NOT NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_conversation_message_identity" ON "conversation_message" ("identity_id", "created_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "customer_channel_identity" ("id" text not null, "channel" text not null, "account_id" text not null, "external_user_id" text not null, "customer_id" text null, "consent_status" text check ("consent_status" in ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT')) not null default 'UNKNOWN', "handoff_state" text check ("handoff_state" in ('BOT', 'HUMAN')) not null default 'BOT', "last_inbound_at" timestamptz null, "failed_link_attempts" integer not null default 0, "link_locked_until" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_channel_identity_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_channel_identity_deleted_at" ON "customer_channel_identity" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_channel_identity_unique" ON "customer_channel_identity" ("channel", "account_id", "external_user_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_channel_identity_customer" ON "customer_channel_identity" ("customer_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "notification_log" ("id" text not null, "identity_id" text not null, "dedupe_key" text not null, "event_type" text not null, "status" text check ("status" in ('PENDING', 'SENT', 'SKIPPED', 'FAILED')) not null default 'PENDING', "reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "notification_log_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_log_deleted_at" ON "notification_log" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notification_log_dedupe_unique" ON "notification_log" ("identity_id", "dedupe_key") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_log_rate" ON "notification_log" ("identity_id", "created_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "social_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "social_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_social_idempotency_record_deleted_at" ON "social_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_social_idempotency_record_scope_key_unique" ON "social_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "social_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "social_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_social_outbox_event_deleted_at" ON "social_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_social_outbox_event_event_id_unique" ON "social_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_social_outbox_event_pending" ON "social_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "channel_link_code" cascade;`);

    this.addSql(`drop table if exists "conversation_message" cascade;`);

    this.addSql(`drop table if exists "customer_channel_identity" cascade;`);

    this.addSql(`drop table if exists "notification_log" cascade;`);

    this.addSql(`drop table if exists "social_idempotency_record" cascade;`);

    this.addSql(`drop table if exists "social_outbox_event" cascade;`);
  }
}
