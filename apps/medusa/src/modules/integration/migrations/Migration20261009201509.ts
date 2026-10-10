import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261009201509 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "inbox_event" drop constraint if exists "inbox_event_provider_external_unique";`
    );
    this.addSql(
      `create table if not exists "audit_log" ("id" text not null, "actor_id" text not null, "action" text not null, "resource_type" text not null, "resource_id" text not null, "reason" text null, "before" jsonb null, "after" jsonb null, "correlation_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "audit_log_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_deleted_at" ON "audit_log" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_resource" ON "audit_log" ("resource_type", "resource_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_actor" ON "audit_log" ("actor_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_action" ON "audit_log" ("action") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "inbox_event" ("id" text not null, "provider" text not null, "external_event_id" text not null, "event_type" text not null, "payload" jsonb not null, "status" text check ("status" in ('RECEIVED', 'PROCESSING', 'PROCESSED', 'RETRY', 'DLQ')) not null default 'RECEIVED', "attempts" integer not null default 0, "next_retry_at" timestamptz null, "processed_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "inbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_inbox_event_deleted_at" ON "inbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_inbox_event_provider_external_unique" ON "inbox_event" ("provider", "external_event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_inbox_event_status_retry" ON "inbox_event" ("status", "next_retry_at") WHERE deleted_at IS NULL;`
    );

    // The audit trail is append-only (NFR-AUD-001/002).
    this.addSql(
      `create or replace function fashion_reject_mutation() returns trigger as $$ begin raise exception '% on % is not allowed: append-only table', TG_OP, TG_TABLE_NAME using errcode = 'restrict_violation'; end; $$ language plpgsql;`
    );
    this.addSql(`drop trigger if exists "audit_log_immutable" on "audit_log";`);
    this.addSql(
      `create trigger "audit_log_immutable" before update or delete on "audit_log" for each row execute function fashion_reject_mutation();`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "audit_log" cascade;`);

    this.addSql(`drop table if exists "inbox_event" cascade;`);
  }
}
