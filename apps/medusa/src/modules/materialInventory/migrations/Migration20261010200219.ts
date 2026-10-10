import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010200219 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "material_transfer" drop constraint if exists "material_transfer_no_unique";`
    );
    this.addSql(
      `create table if not exists "material_cycle_count" ("id" text not null, "balance_id" text not null, "material_id" text not null, "expected_version" integer not null, "expected_on_hand" numeric not null, "counted_qty" numeric not null, "diff_qty" numeric not null, "status" text check ("status" in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NO_DIFFERENCE', 'STALE')) not null default 'PENDING_APPROVAL', "reason" text not null, "counted_by" text not null, "decided_by" text null, "decided_at" timestamptz null, "decision_reason" text null, "raw_expected_on_hand" jsonb not null, "raw_counted_qty" jsonb not null, "raw_diff_qty" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_cycle_count_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_cycle_count_deleted_at" ON "material_cycle_count" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_cycle_count_balance" ON "material_cycle_count" ("balance_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_cycle_count_status" ON "material_cycle_count" ("status") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_transfer" ("id" text not null, "transfer_no" text not null, "status" text check ("status" in ('IN_TRANSIT', 'RECEIVED', 'CANCELLED')) not null default 'IN_TRANSIT', "material_id" text not null, "lot_id" text null, "roll_id" text null, "qty" numeric not null, "from_balance_id" text not null, "from_location_id" text not null, "transit_balance_id" text not null, "transit_location_id" text not null, "to_location_id" text not null, "dispatched_by" text not null, "dispatched_at" timestamptz not null, "closed_by" text null, "closed_at" timestamptz null, "notes" text null, "raw_qty" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_transfer_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_transfer_deleted_at" ON "material_transfer" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_transfer_no_unique" ON "material_transfer" ("transfer_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_transfer_status" ON "material_transfer" ("status") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_transfer_material" ON "material_transfer" ("material_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `alter table if exists "material" add column if not exists "roll_fragment_reduction" boolean not null default true;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "material_cycle_count" cascade;`);

    this.addSql(`drop table if exists "material_transfer" cascade;`);

    this.addSql(
      `alter table if exists "material" drop column if exists "roll_fragment_reduction";`
    );
  }
}
