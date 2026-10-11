import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010203836 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "platform_setting" drop constraint if exists "platform_setting_unique";`
    );
    this.addSql(
      `alter table if exists "ops_gauge" drop constraint if exists "ops_gauge_name_unique";`
    );
    this.addSql(
      `alter table if exists "country_profile" drop constraint if exists "country_profile_code_unique";`
    );
    this.addSql(
      `create table if not exists "country_profile" ("id" text not null, "country_code" text not null, "name" text not null, "currency_code" text not null, "tax_region" text null, "carrier_code" text null, "payment_providers" jsonb null, "warehouse_codes" jsonb null, "return_window_days" integer null, "social_channels" jsonb null, "legal_entity" jsonb null, "is_active" boolean not null default true, "updated_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "country_profile_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_country_profile_deleted_at" ON "country_profile" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_country_profile_code_unique" ON "country_profile" ("country_code") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "ops_gauge" ("id" text not null, "name" text not null, "value" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ops_gauge_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ops_gauge_deleted_at" ON "ops_gauge" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ops_gauge_name_unique" ON "ops_gauge" ("name") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "platform_setting" ("id" text not null, "key" text not null, "scope_type" text check ("scope_type" in ('GLOBAL', 'COUNTRY', 'WAREHOUSE')) not null default 'GLOBAL', "scope_id" text not null default '', "value" jsonb not null, "updated_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "platform_setting_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_platform_setting_deleted_at" ON "platform_setting" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_platform_setting_unique" ON "platform_setting" ("key", "scope_type", "scope_id") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "country_profile" cascade;`);

    this.addSql(`drop table if exists "ops_gauge" cascade;`);

    this.addSql(`drop table if exists "platform_setting" cascade;`);
  }
}
