import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010101820 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "quality_outbox_event" drop constraint if exists "quality_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "quality_inspection" drop constraint if exists "quality_inspection_no_unique";`
    );
    this.addSql(
      `alter table if exists "quality_idempotency_record" drop constraint if exists "quality_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `create table if not exists "quality_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quality_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_idempotency_record_deleted_at" ON "quality_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_quality_idempotency_record_scope_key_unique" ON "quality_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "quality_inspection" ("id" text not null, "inspection_no" text not null, "target_type" text check ("target_type" in ('BUNDLE', 'GOODS_RECEIPT_LINE')) not null, "target_id" text not null, "reference_type" text null, "reference_id" text null, "qty_inspected" numeric not null, "pass_qty" numeric not null default 0, "rework_qty" numeric not null default 0, "reject_qty" numeric not null default 0, "hold_qty" numeric not null default 0, "defects" jsonb null, "notes" text null, "inspector_id" text not null, "raw_qty_inspected" jsonb not null, "raw_pass_qty" jsonb not null default '{"value":"0","precision":20}', "raw_rework_qty" jsonb not null default '{"value":"0","precision":20}', "raw_reject_qty" jsonb not null default '{"value":"0","precision":20}', "raw_hold_qty" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quality_inspection_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_inspection_deleted_at" ON "quality_inspection" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_quality_inspection_no_unique" ON "quality_inspection" ("inspection_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_inspection_target" ON "quality_inspection" ("target_type", "target_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_inspection_reference" ON "quality_inspection" ("reference_type", "reference_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "quality_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quality_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_outbox_event_deleted_at" ON "quality_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_quality_outbox_event_event_id_unique" ON "quality_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_quality_outbox_event_pending" ON "quality_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `alter table "quality_inspection" drop constraint if exists "quality_inspection_conservation";`
    );
    this.addSql(
      `alter table "quality_inspection" add constraint "quality_inspection_conservation" check (pass_qty >= 0 and rework_qty >= 0 and reject_qty >= 0 and hold_qty >= 0 and pass_qty + rework_qty + reject_qty + hold_qty = qty_inspected and qty_inspected > 0);`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "quality_idempotency_record" cascade;`);

    this.addSql(`drop table if exists "quality_inspection" cascade;`);

    this.addSql(`drop table if exists "quality_outbox_event" cascade;`);
  }
}
