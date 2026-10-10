import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261009204613 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "supplier" drop constraint if exists "supplier_code_unique";`
    );
    this.addSql(
      `alter table if exists "purchase_order_line" drop constraint if exists "purchase_order_line_no_unique";`
    );
    this.addSql(
      `alter table if exists "purchase_order" drop constraint if exists "purchase_order_number_unique";`
    );
    this.addSql(
      `alter table if exists "procurement_outbox_event" drop constraint if exists "procurement_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "procurement_idempotency_record" drop constraint if exists "procurement_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `alter table if exists "goods_receipt" drop constraint if exists "goods_receipt_no_unique";`
    );
    this.addSql(
      `create table if not exists "goods_receipt" ("id" text not null, "receipt_no" text not null, "purchase_order_id" text not null, "supplier_id" text not null, "location_id" text not null, "status" text check ("status" in ('PENDING_INVENTORY', 'POSTED', 'VOID')) not null default 'PENDING_INVENTORY', "delivery_note" text null, "received_by" text not null, "received_at" timestamptz not null, "idempotency_key" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "goods_receipt_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_goods_receipt_deleted_at" ON "goods_receipt" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_goods_receipt_no_unique" ON "goods_receipt" ("receipt_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_goods_receipt_po" ON "goods_receipt" ("purchase_order_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_goods_receipt_status" ON "goods_receipt" ("status") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "goods_receipt_line" ("id" text not null, "goods_receipt_id" text not null, "purchase_order_line_id" text not null, "material_id" text not null, "qty" numeric not null, "bucket" text check ("bucket" in ('GOOD', 'QC_HOLD', 'DAMAGED')) not null default 'GOOD', "lot_no" text not null, "dye_lot_no" text not null default '', "rolls" jsonb null, "raw_qty" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "goods_receipt_line_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_goods_receipt_line_deleted_at" ON "goods_receipt_line" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_goods_receipt_line_receipt" ON "goods_receipt_line" ("goods_receipt_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_goods_receipt_line_po_line" ON "goods_receipt_line" ("purchase_order_line_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "procurement_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "procurement_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_procurement_idempotency_record_deleted_at" ON "procurement_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_procurement_idempotency_record_scope_key_unique" ON "procurement_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "procurement_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "procurement_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_procurement_outbox_event_deleted_at" ON "procurement_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_procurement_outbox_event_event_id_unique" ON "procurement_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_procurement_outbox_event_pending" ON "procurement_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "purchase_order" ("id" text not null, "po_number" text not null, "supplier_id" text not null, "status" text check ("status" in ('DRAFT', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')) not null default 'DRAFT', "currency_code" text not null default 'VND', "expected_at" timestamptz null, "notes" text null, "created_by" text not null, "approved_by" text null, "approved_at" timestamptz null, "sent_at" timestamptz null, "closed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "purchase_order_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_order_deleted_at" ON "purchase_order" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_purchase_order_number_unique" ON "purchase_order" ("po_number") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_order_supplier" ON "purchase_order" ("supplier_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_order_status" ON "purchase_order" ("status") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "purchase_order_line" ("id" text not null, "purchase_order_id" text not null, "line_no" integer not null, "material_id" text not null, "uom" text not null, "ordered_qty" numeric not null, "received_qty" numeric not null default 0, "over_receipt_pct" integer not null default 5, "unit_price" numeric not null default 0, "raw_ordered_qty" jsonb not null, "raw_received_qty" jsonb not null default '{"value":"0","precision":20}', "raw_unit_price" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "purchase_order_line_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_order_line_deleted_at" ON "purchase_order_line" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_purchase_order_line_no_unique" ON "purchase_order_line" ("purchase_order_id", "line_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_order_line_material" ON "purchase_order_line" ("material_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "supplier" ("id" text not null, "code" text not null, "name" text not null, "status" text check ("status" in ('ACTIVE', 'INACTIVE', 'BLOCKED')) not null default 'ACTIVE', "contact_name" text null, "email" text null, "phone" text null, "address" text null, "payment_terms" text null, "supported_material_ids" text[] null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "supplier_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_supplier_deleted_at" ON "supplier" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_supplier_code_unique" ON "supplier" ("code") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "goods_receipt" cascade;`);

    this.addSql(`drop table if exists "goods_receipt_line" cascade;`);

    this.addSql(
      `drop table if exists "procurement_idempotency_record" cascade;`
    );

    this.addSql(`drop table if exists "procurement_outbox_event" cascade;`);

    this.addSql(`drop table if exists "purchase_order" cascade;`);

    this.addSql(`drop table if exists "purchase_order_line" cascade;`);

    this.addSql(`drop table if exists "supplier" cascade;`);
  }
}
