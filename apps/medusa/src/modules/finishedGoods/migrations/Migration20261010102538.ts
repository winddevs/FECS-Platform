import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010102538 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "finished_goods_outbox_event" drop constraint if exists "finished_goods_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "finished_goods_idempotency_record" drop constraint if exists "finished_goods_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `alter table if exists "fg_location" drop constraint if exists "fg_location_code_unique";`
    );
    this.addSql(
      `alter table if exists "fg_batch" drop constraint if exists "fg_batch_packing_unique";`
    );
    this.addSql(
      `alter table if exists "fg_batch" drop constraint if exists "fg_batch_no_unique";`
    );
    this.addSql(
      `alter table if exists "fg_balance" drop constraint if exists "fg_balance_sku_location_unique";`
    );
    this.addSql(
      `alter table if exists "commerce_sync_state" drop constraint if exists "commerce_sync_state_unique";`
    );
    this.addSql(
      `create table if not exists "commerce_sync_state" ("id" text not null, "sku" text not null, "location_id" text not null, "last_applied_version" integer not null default 0, "applied_available" integer not null default 0, "status" text check ("status" in ('OK', 'UNMAPPED', 'ERROR')) not null default 'OK', "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commerce_sync_state_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_commerce_sync_state_deleted_at" ON "commerce_sync_state" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_commerce_sync_state_unique" ON "commerce_sync_state" ("sku", "location_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fg_allocation" ("id" text not null, "order_id" text not null, "sku" text not null, "location_id" text not null, "qty" integer not null, "shipped_qty" integer not null default 0, "batch_id" text null, "status" text check ("status" in ('ALLOCATED', 'SHIPPED', 'RELEASED')) not null default 'ALLOCATED', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fg_allocation_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_allocation_deleted_at" ON "fg_allocation" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_allocation_order" ON "fg_allocation" ("order_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_allocation_sku" ON "fg_allocation" ("sku", "location_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fg_balance" ("id" text not null, "sku" text not null, "location_id" text not null, "on_hand" integer not null default 0, "warehouse_hold" integer not null default 0, "qc_hold" integer not null default 0, "allocated" integer not null default 0, "safety_stock" integer not null default 0, "version" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fg_balance_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_balance_deleted_at" ON "fg_balance" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fg_balance_sku_location_unique" ON "fg_balance" ("sku", "location_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fg_batch" ("id" text not null, "batch_no" text not null, "sku" text not null, "source" text check ("source" in ('PRODUCTION', 'RETURN')) not null default 'PRODUCTION', "location_id" text not null, "qty" integer not null, "remaining_qty" integer not null default 0, "mo_id" text null, "production_batch_id" text null, "packing_record_id" text null, "return_item_id" text null, "produced_at" timestamptz not null, "traceability" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fg_batch_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_batch_deleted_at" ON "fg_batch" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fg_batch_no_unique" ON "fg_batch" ("batch_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fg_batch_packing_unique" ON "fg_batch" ("packing_record_id") WHERE deleted_at IS NULL AND packing_record_id IS NOT NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_batch_sku" ON "fg_batch" ("sku") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_batch_mo" ON "fg_batch" ("mo_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fg_location" ("id" text not null, "code" text not null, "name" text not null, "warehouse_code" text not null, "is_commerce" boolean not null default true, "medusa_stock_location_id" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fg_location_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_location_deleted_at" ON "fg_location" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fg_location_code_unique" ON "fg_location" ("code") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fg_movement" ("id" text not null, "movement_type" text check ("movement_type" in ('RECEIPT', 'SHIP', 'ADJUST_PLUS', 'ADJUST_MINUS', 'HOLD', 'RELEASE_HOLD', 'ALLOCATE', 'DEALLOCATE')) not null, "sku" text not null, "location_id" text not null, "balance_id" text not null, "batch_id" text null, "qty" integer not null, "on_hand_delta" integer not null default 0, "warehouse_hold_delta" integer not null default 0, "qc_hold_delta" integer not null default 0, "allocated_delta" integer not null default 0, "balance_version" integer not null, "reference_type" text null, "reference_id" text null, "reason" text null, "actor_id" text not null, "occurred_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fg_movement_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_movement_deleted_at" ON "fg_movement" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_movement_balance" ON "fg_movement" ("balance_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_movement_sku" ON "fg_movement" ("sku", "occurred_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_movement_reference" ON "fg_movement" ("reference_type", "reference_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fg_shipment_line" ("id" text not null, "reference_type" text not null, "reference_id" text not null, "order_id" text null, "sku" text not null, "batch_id" text null, "qty" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fg_shipment_line_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_shipment_line_deleted_at" ON "fg_shipment_line" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_shipment_line_reference" ON "fg_shipment_line" ("reference_type", "reference_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_shipment_line_order" ON "fg_shipment_line" ("order_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_shipment_line_batch" ON "fg_shipment_line" ("batch_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "finished_goods_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finished_goods_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finished_goods_idempotency_record_deleted_at" ON "finished_goods_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finished_goods_idempotency_record_scope_key_unique" ON "finished_goods_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "finished_goods_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finished_goods_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finished_goods_outbox_event_deleted_at" ON "finished_goods_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finished_goods_outbox_event_event_id_unique" ON "finished_goods_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finished_goods_outbox_event_pending" ON "finished_goods_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `alter table "fg_balance" drop constraint if exists "fg_balance_invariants";`
    );
    this.addSql(
      `alter table "fg_balance" add constraint "fg_balance_invariants" check (on_hand >= 0 and warehouse_hold >= 0 and qc_hold >= 0 and allocated >= 0 and warehouse_hold + qc_hold + allocated <= on_hand and safety_stock >= 0);`
    );
    this.addSql(
      `alter table "fg_allocation" drop constraint if exists "fg_allocation_consistent";`
    );
    this.addSql(
      `alter table "fg_allocation" add constraint "fg_allocation_consistent" check (qty > 0 and shipped_qty >= 0 and shipped_qty <= qty);`
    );
    this.addSql(
      `create or replace function fashion_reject_mutation() returns trigger as $$ begin raise exception '% on % is not allowed: append-only table', TG_OP, TG_TABLE_NAME using errcode = 'restrict_violation'; end; $$ language plpgsql;`
    );
    this.addSql(
      `drop trigger if exists "fg_movement_immutable" on "fg_movement";`
    );
    this.addSql(
      `create trigger "fg_movement_immutable" before update or delete on "fg_movement" for each row execute function fashion_reject_mutation();`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commerce_sync_state" cascade;`);

    this.addSql(`drop table if exists "fg_allocation" cascade;`);

    this.addSql(`drop table if exists "fg_balance" cascade;`);

    this.addSql(`drop table if exists "fg_batch" cascade;`);

    this.addSql(`drop table if exists "fg_location" cascade;`);

    this.addSql(`drop table if exists "fg_movement" cascade;`);

    this.addSql(`drop table if exists "fg_shipment_line" cascade;`);

    this.addSql(
      `drop table if exists "finished_goods_idempotency_record" cascade;`
    );

    this.addSql(`drop table if exists "finished_goods_outbox_event" cascade;`);
  }
}
