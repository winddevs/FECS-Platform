import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010202336 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "carrier_shipment" drop constraint if exists "carrier_shipment_exchange_unique";`
    );
    this.addSql(
      `alter table if exists "shipment_exception" drop constraint if exists "shipment_exception_open_unique";`
    );
    this.addSql(
      `create table if not exists "shipment_exception" ("id" text not null, "shipment_id" text not null, "order_id" text not null, "type" text check ("type" in ('DELIVERY_FAILED', 'RETURNED_TO_SENDER', 'CARRIER_EXCEPTION')) not null, "status" text check ("status" in ('OPEN', 'RESOLVED')) not null default 'OPEN', "detail" jsonb null, "resolution" text check ("resolution" in ('REDELIVER', 'REFUND', 'RESTOCK', 'CLOSE')) null, "resolution_note" text null, "resolved_by" text null, "resolved_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shipment_exception_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shipment_exception_deleted_at" ON "shipment_exception" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_shipment_exception_open_unique" ON "shipment_exception" ("shipment_id", "type") WHERE deleted_at IS NULL AND status = 'OPEN';`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shipment_exception_status" ON "shipment_exception" ("status", "type") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shipment_exception_order" ON "shipment_exception" ("order_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `alter table if exists "carrier_shipment" add column if not exists "exchange_return_id" text null, add column if not exists "superseded_at" timestamptz null, add column if not exists "superseded_by_id" text null;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_carrier_shipment_exchange_unique" ON "carrier_shipment" ("carrier_code", "exchange_return_id") WHERE deleted_at IS NULL AND exchange_return_id IS NOT NULL AND superseded_at IS NULL;`
    );
    this.rebuildUniqueIndexes(true);
  }

  // The generator does not rebuild an index whose WHERE clause changed, so the
  // two existing "one shipment per source" indexes are recreated by hand: a
  // superseded shipment must not keep holding the slot of its replacement.
  private rebuildUniqueIndexes(excludeSuperseded: boolean): void {
    const extra = excludeSuperseded ? " AND superseded_at IS NULL" : "";
    this.addSql(
      `drop index if exists "IDX_carrier_shipment_fulfillment_unique";`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_carrier_shipment_fulfillment_unique" ON "carrier_shipment" ("carrier_code", "medusa_fulfillment_id") WHERE deleted_at IS NULL AND medusa_fulfillment_id IS NOT NULL${extra};`
    );
    this.addSql(`drop index if exists "IDX_carrier_shipment_return_unique";`);
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_carrier_shipment_return_unique" ON "carrier_shipment" ("carrier_code", "return_id") WHERE deleted_at IS NULL AND return_id IS NOT NULL${extra};`
    );
  }

  override async down(): Promise<void> {
    this.rebuildUniqueIndexes(false);
    this.addSql(`drop table if exists "shipment_exception" cascade;`);

    this.addSql(`drop index if exists "IDX_carrier_shipment_exchange_unique";`);
    this.addSql(
      `alter table if exists "carrier_shipment" drop column if exists "exchange_return_id", drop column if exists "superseded_at", drop column if exists "superseded_by_id";`
    );
  }
}
