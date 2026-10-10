import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010134805 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "production_request" drop constraint if exists "production_request_line_unique";`
    );
    this.addSql(
      `create table if not exists "production_request" ("id" text not null, "order_id" text not null, "order_line_id" text not null, "sku" text not null, "product_sku" text not null, "qty" integer not null, "status" text check ("status" in ('REQUESTED', 'WAITING_MATERIAL', 'MO_CREATED', 'COMPLETED', 'CANCELLED', 'FAILED')) not null default 'REQUESTED', "payment_confirmed" boolean not null default false, "mo_id" text null, "attempts" integer not null default 0, "next_attempt_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "production_request_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_production_request_deleted_at" ON "production_request" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_production_request_line_unique" ON "production_request" ("order_line_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_production_request_order" ON "production_request" ("order_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_production_request_status" ON "production_request" ("status", "next_attempt_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "production_request" cascade;`);
  }
}
