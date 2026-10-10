import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010201114 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "sku_planning_param" drop constraint if exists "sku_planning_param_unique";`
    );
    this.addSql(
      `create table if not exists "sku_planning_param" ("id" text not null, "sku" text not null, "reorder_point" integer not null default 0, "reorder_qty" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sku_planning_param_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_sku_planning_param_deleted_at" ON "sku_planning_param" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sku_planning_param_unique" ON "sku_planning_param" ("sku") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `alter table if exists "manufacturing_order" add column if not exists "source_mo_id" text null, add column if not exists "short_closed" boolean not null default false, add column if not exists "short_close_reason" text null;`
    );

    this.addSql(
      `alter table if exists "mrp_suggestion" add column if not exists "sku" text null, add column if not exists "detail" jsonb null;`
    );
    this.addSql(
      `alter table if exists "mrp_suggestion" alter column "material_id" type text using ("material_id"::text);`
    );
    this.addSql(
      `alter table if exists "mrp_suggestion" alter column "material_id" drop not null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "sku_planning_param" cascade;`);

    this.addSql(
      `alter table if exists "manufacturing_order" drop column if exists "source_mo_id", drop column if exists "short_closed", drop column if exists "short_close_reason";`
    );

    this.addSql(
      `alter table if exists "mrp_suggestion" drop column if exists "sku", drop column if exists "detail";`
    );

    this.addSql(
      `alter table if exists "mrp_suggestion" alter column "material_id" type text using ("material_id"::text);`
    );
    this.addSql(
      `alter table if exists "mrp_suggestion" alter column "material_id" set not null;`
    );
  }
}
