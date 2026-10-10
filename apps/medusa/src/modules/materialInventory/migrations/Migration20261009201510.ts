import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261009201510 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "material_roll" drop constraint if exists "material_roll_code_unique";`
    );
    this.addSql(
      `alter table if exists "material_reservation" drop constraint if exists "material_reservation_no_unique";`
    );
    this.addSql(
      `alter table if exists "material_lot" drop constraint if exists "material_lot_identity_unique";`
    );
    this.addSql(
      `alter table if exists "material_location" drop constraint if exists "material_location_code_unique";`
    );
    this.addSql(
      `alter table if exists "material_inventory_outbox_event" drop constraint if exists "material_inventory_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "material_inventory_idempotency_record" drop constraint if exists "material_inventory_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `alter table if exists "material_balance" drop constraint if exists "material_balance_key_unique";`
    );
    this.addSql(
      `alter table if exists "material" drop constraint if exists "material_code_unique";`
    );
    this.addSql(
      `create table if not exists "material" ("id" text not null, "code" text not null, "name" text not null, "material_type" text check ("material_type" in ('FABRIC', 'TRIM', 'PACKAGING', 'OTHER')) not null default 'FABRIC', "uom" text not null, "track_lot" boolean not null default true, "track_roll" boolean not null default false, "track_dye_lot" boolean not null default false, "max_dye_lots" integer not null default 1, "allocation_policy" text check ("allocation_policy" in ('FIFO', 'SAME_DYE_LOT_FIFO')) not null default 'SAME_DYE_LOT_FIFO', "is_active" boolean not null default true, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_deleted_at" ON "material" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_code_unique" ON "material" ("code") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_balance" ("id" text not null, "balance_key" text not null, "material_id" text not null, "lot_id" text null, "roll_id" text null, "location_id" text not null, "on_hand_qty" numeric not null default 0, "reserved_qty" numeric not null default 0, "qc_hold_qty" numeric not null default 0, "damaged_qty" numeric not null default 0, "version" integer not null default 1, "raw_on_hand_qty" jsonb not null default '{"value":"0","precision":20}', "raw_reserved_qty" jsonb not null default '{"value":"0","precision":20}', "raw_qc_hold_qty" jsonb not null default '{"value":"0","precision":20}', "raw_damaged_qty" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_balance_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_balance_deleted_at" ON "material_balance" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_balance_key_unique" ON "material_balance" ("balance_key") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_balance_material_location" ON "material_balance" ("material_id", "location_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_balance_roll" ON "material_balance" ("roll_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_balance_lot" ON "material_balance" ("lot_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_inventory_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_inventory_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_inventory_idempotency_record_deleted_at" ON "material_inventory_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_inventory_idempotency_record_scope_key_unique" ON "material_inventory_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_inventory_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_inventory_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_inventory_outbox_event_deleted_at" ON "material_inventory_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_inventory_outbox_event_event_id_unique" ON "material_inventory_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_inventory_outbox_event_pending" ON "material_inventory_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_location" ("id" text not null, "code" text not null, "name" text not null, "warehouse_code" text not null, "kind" text check ("kind" in ('RAW_MATERIAL', 'WIP', 'QC_HOLD', 'QUARANTINE', 'IN_TRANSIT', 'RETURN_QC')) not null default 'RAW_MATERIAL', "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_location_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_location_deleted_at" ON "material_location" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_location_code_unique" ON "material_location" ("code") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_lot" ("id" text not null, "material_id" text not null, "lot_no" text not null, "dye_lot_no" text not null default '', "supplier_id" text null, "source_type" text null, "source_id" text null, "received_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_lot_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_lot_deleted_at" ON "material_lot" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_lot_identity_unique" ON "material_lot" ("material_id", "lot_no", "dye_lot_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_lot_material" ON "material_lot" ("material_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_lot_source" ON "material_lot" ("source_type", "source_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_reservation" ("id" text not null, "reservation_no" text not null, "material_id" text not null, "reference_type" text not null, "reference_id" text not null, "reference_line" text null, "requested_qty" numeric not null, "issued_qty" numeric not null default 0, "released_qty" numeric not null default 0, "status" text check ("status" in ('ACTIVE', 'PARTIALLY_ISSUED', 'ISSUED', 'RELEASED')) not null default 'ACTIVE', "dye_lot_count" integer not null default 0, "planner_approved" boolean not null default false, "created_by" text not null, "idempotency_key" text null, "raw_requested_qty" jsonb not null, "raw_issued_qty" jsonb not null default '{"value":"0","precision":20}', "raw_released_qty" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_reservation_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_reservation_deleted_at" ON "material_reservation" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_reservation_no_unique" ON "material_reservation" ("reservation_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_reservation_reference" ON "material_reservation" ("reference_type", "reference_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_reservation_material" ON "material_reservation" ("material_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_reservation_line" ("id" text not null, "reservation_id" text not null, "balance_id" text not null, "material_id" text not null, "lot_id" text null, "roll_id" text null, "location_id" text not null, "reserved_qty" numeric not null, "issued_qty" numeric not null default 0, "released_qty" numeric not null default 0, "raw_reserved_qty" jsonb not null, "raw_issued_qty" jsonb not null default '{"value":"0","precision":20}', "raw_released_qty" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_reservation_line_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_reservation_line_deleted_at" ON "material_reservation_line" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_reservation_line_reservation" ON "material_reservation_line" ("reservation_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_reservation_line_balance" ON "material_reservation_line" ("balance_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_roll" ("id" text not null, "roll_code" text not null, "material_id" text not null, "lot_id" text not null, "initial_qty" numeric not null, "width_cm" integer null, "status" text check ("status" in ('ACTIVE', 'DEPLETED', 'DAMAGED')) not null default 'ACTIVE', "raw_initial_qty" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_roll_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_roll_deleted_at" ON "material_roll" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_roll_code_unique" ON "material_roll" ("roll_code") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_roll_lot" ON "material_roll" ("lot_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_roll_material" ON "material_roll" ("material_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_stock_movement" ("id" text not null, "movement_type" text check ("movement_type" in ('RECEIPT', 'ISSUE_TO_PRODUCTION', 'RETURN_FROM_PRODUCTION', 'TRANSFER_OUT', 'TRANSFER_IN', 'SCRAP', 'ADJUSTMENT_PLUS', 'ADJUSTMENT_MINUS', 'QC_RELEASE', 'QC_REJECT')) not null, "material_id" text not null, "lot_id" text null, "roll_id" text null, "location_id" text not null, "balance_id" text not null, "qty" numeric not null, "on_hand_delta" numeric not null default 0, "qc_hold_delta" numeric not null default 0, "damaged_delta" numeric not null default 0, "reference_type" text null, "reference_id" text null, "reason" text null, "actor_id" text not null, "correlation_id" text null, "idempotency_key" text null, "occurred_at" timestamptz not null, "raw_qty" jsonb not null, "raw_on_hand_delta" jsonb not null default '{"value":"0","precision":20}', "raw_qc_hold_delta" jsonb not null default '{"value":"0","precision":20}', "raw_damaged_delta" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_stock_movement_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_stock_movement_deleted_at" ON "material_stock_movement" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_movement_balance" ON "material_stock_movement" ("balance_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_movement_material" ON "material_stock_movement" ("material_id", "occurred_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_movement_reference" ON "material_stock_movement" ("reference_type", "reference_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_movement_roll" ON "material_stock_movement" ("roll_id") WHERE deleted_at IS NULL;`
    );

    // Hard invariants (TDD section 10): never negative, and
    // reserved + qc_hold + damaged <= on_hand.
    this.addSql(
      `alter table "material_balance" drop constraint if exists "material_balance_non_negative";`
    );
    this.addSql(
      `alter table "material_balance" add constraint "material_balance_non_negative" check (on_hand_qty >= 0 and reserved_qty >= 0 and qc_hold_qty >= 0 and damaged_qty >= 0);`
    );
    this.addSql(
      `alter table "material_balance" drop constraint if exists "material_balance_reserved_within_on_hand";`
    );
    this.addSql(
      `alter table "material_balance" add constraint "material_balance_reserved_within_on_hand" check (reserved_qty + qc_hold_qty + damaged_qty <= on_hand_qty);`
    );
    this.addSql(
      `alter table "material_reservation_line" drop constraint if exists "material_reservation_line_consistent";`
    );
    this.addSql(
      `alter table "material_reservation_line" add constraint "material_reservation_line_consistent" check (issued_qty >= 0 and released_qty >= 0 and issued_qty + released_qty <= reserved_qty);`
    );

    // The stock ledger is append-only (FR-INV-001, NFR-AUD-001).
    this.addSql(
      `create or replace function fashion_reject_mutation() returns trigger as $$ begin raise exception '% on % is not allowed: append-only table', TG_OP, TG_TABLE_NAME using errcode = 'restrict_violation'; end; $$ language plpgsql;`
    );
    this.addSql(
      `drop trigger if exists "material_stock_movement_immutable" on "material_stock_movement";`
    );
    this.addSql(
      `create trigger "material_stock_movement_immutable" before update or delete on "material_stock_movement" for each row execute function fashion_reject_mutation();`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "material" cascade;`);

    this.addSql(`drop table if exists "material_balance" cascade;`);

    this.addSql(
      `drop table if exists "material_inventory_idempotency_record" cascade;`
    );

    this.addSql(
      `drop table if exists "material_inventory_outbox_event" cascade;`
    );

    this.addSql(`drop table if exists "material_location" cascade;`);

    this.addSql(`drop table if exists "material_lot" cascade;`);

    this.addSql(`drop table if exists "material_reservation" cascade;`);

    this.addSql(`drop table if exists "material_reservation_line" cascade;`);

    this.addSql(`drop table if exists "material_roll" cascade;`);

    this.addSql(`drop table if exists "material_stock_movement" cascade;`);
  }
}
