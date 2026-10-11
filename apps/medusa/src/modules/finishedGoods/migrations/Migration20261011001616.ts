import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261011001616 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "fg_transfer" drop constraint if exists "fg_transfer_no_unique";`
    );
    this.addSql(
      `create table if not exists "fg_transfer" ("id" text not null, "transfer_no" text not null, "status" text check ("status" in ('IN_TRANSIT', 'RECEIVED', 'CANCELLED')) not null default 'IN_TRANSIT', "sku" text not null, "qty" integer not null, "from_location_id" text not null, "transit_location_id" text not null, "to_location_id" text not null, "dispatched_by" text not null, "dispatched_at" timestamptz not null, "closed_by" text null, "closed_at" timestamptz null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fg_transfer_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_transfer_deleted_at" ON "fg_transfer" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fg_transfer_no_unique" ON "fg_transfer" ("transfer_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_transfer_status" ON "fg_transfer" ("status") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fg_transfer_sku" ON "fg_transfer" ("sku") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `alter table if exists "fg_batch" drop constraint if exists "fg_batch_source_check";`
    );

    this.addSql(
      `alter table if exists "fg_movement" drop constraint if exists "fg_movement_movement_type_check";`
    );

    this.addSql(
      `alter table if exists "fg_batch" add column if not exists "parent_batch_id" text null;`
    );
    this.addSql(
      `alter table if exists "fg_batch" add constraint "fg_batch_source_check" check("source" in ('PRODUCTION', 'RETURN', 'TRANSFER'));`
    );

    this.addSql(
      `alter table if exists "fg_location" add column if not exists "kind" text check ("kind" in ('FACTORY', 'FULFILLMENT', 'IN_TRANSIT', 'RETURN_QC', 'QUARANTINE', 'SHOWROOM')) not null default 'FULFILLMENT';`
    );

    this.addSql(
      `alter table if exists "fg_movement" add constraint "fg_movement_movement_type_check" check("movement_type" in ('RECEIPT', 'SHIP', 'ADJUST_PLUS', 'ADJUST_MINUS', 'HOLD', 'RELEASE_HOLD', 'ALLOCATE', 'DEALLOCATE', 'TRANSFER_OUT', 'TRANSFER_IN'));`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fg_transfer" cascade;`);

    this.addSql(
      `alter table if exists "fg_batch" drop constraint if exists "fg_batch_source_check";`
    );

    this.addSql(
      `alter table if exists "fg_movement" drop constraint if exists "fg_movement_movement_type_check";`
    );

    this.addSql(
      `alter table if exists "fg_batch" drop column if exists "parent_batch_id";`
    );

    this.addSql(
      `alter table if exists "fg_batch" add constraint "fg_batch_source_check" check("source" in ('PRODUCTION', 'RETURN'));`
    );

    this.addSql(
      `alter table if exists "fg_location" drop column if exists "kind";`
    );

    this.addSql(
      `alter table if exists "fg_movement" add constraint "fg_movement_movement_type_check" check("movement_type" in ('RECEIPT', 'SHIP', 'ADJUST_PLUS', 'ADJUST_MINUS', 'HOLD', 'RELEASE_HOLD', 'ALLOCATE', 'DEALLOCATE'));`
    );
  }
}
