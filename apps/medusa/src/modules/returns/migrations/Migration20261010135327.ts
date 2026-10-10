import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010135327 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "returns_outbox_event" drop constraint if exists "returns_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "returns_idempotency_record" drop constraint if exists "returns_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `alter table if exists "return_authorization" drop constraint if exists "return_authorization_no_unique";`
    );
    this.addSql(
      `create table if not exists "return_authorization" ("id" text not null, "rma_no" text not null, "order_id" text not null, "customer_id" text null, "type" text check ("type" in ('RETURN', 'EXCHANGE')) not null default 'RETURN', "status" text check ("status" in ('REQUESTED', 'AUTHORIZED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'CLOSED', 'CANCELLED')) not null default 'REQUESTED', "reason" text not null, "eligibility" jsonb not null, "override_reason" text null, "authorized_by" text null, "return_shipment_id" text null, "exchange_sku" text null, "refund_status" text check ("refund_status" in ('NONE', 'REQUESTED', 'COMPLETED', 'FAILED')) not null default 'NONE', "refund_payment_id" text null, "refund_amount" numeric null, "created_by" text not null, "raw_refund_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "return_authorization_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_return_authorization_deleted_at" ON "return_authorization" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_return_authorization_no_unique" ON "return_authorization" ("rma_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_return_authorization_order" ON "return_authorization" ("order_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_return_authorization_status" ON "return_authorization" ("status") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "returns_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "returns_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_returns_idempotency_record_deleted_at" ON "returns_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_returns_idempotency_record_scope_key_unique" ON "returns_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "returns_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "returns_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_returns_outbox_event_deleted_at" ON "returns_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_returns_outbox_event_event_id_unique" ON "returns_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_returns_outbox_event_pending" ON "returns_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "rma_item" ("id" text not null, "return_id" text not null, "order_line_id" text not null, "sku" text not null, "qty" integer not null, "disposition" text check ("disposition" in ('PENDING', 'A_GRADE', 'B_GRADE', 'REWORK', 'DAMAGED', 'SCRAP')) not null default 'PENDING', "destination_location_id" text null, "inspected_by" text null, "inspected_at" timestamptz null, "inspection_notes" text null, "stock_posted" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rma_item_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_rma_item_deleted_at" ON "rma_item" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_rma_item_return" ON "rma_item" ("return_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_rma_item_order_line" ON "rma_item" ("order_line_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `alter table "rma_item" drop constraint if exists "rma_item_qty_positive";`
    );
    this.addSql(
      `alter table "rma_item" add constraint "rma_item_qty_positive" check (qty > 0);`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "return_authorization" cascade;`);

    this.addSql(`drop table if exists "returns_idempotency_record" cascade;`);

    this.addSql(`drop table if exists "returns_outbox_event" cascade;`);

    this.addSql(`drop table if exists "rma_item" cascade;`);
  }
}
