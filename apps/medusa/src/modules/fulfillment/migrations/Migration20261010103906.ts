import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010103906 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tracking_event" drop constraint if exists "tracking_event_unique";`
    );
    this.addSql(
      `alter table if exists "fulfillment_outbox_event" drop constraint if exists "fulfillment_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "fulfillment_idempotency_record" drop constraint if exists "fulfillment_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `alter table if exists "carrier_shipment" drop constraint if exists "carrier_shipment_merchant_ref_unique";`
    );
    this.addSql(
      `alter table if exists "carrier_shipment" drop constraint if exists "carrier_shipment_return_unique";`
    );
    this.addSql(
      `alter table if exists "carrier_shipment" drop constraint if exists "carrier_shipment_fulfillment_unique";`
    );
    this.addSql(
      `create table if not exists "carrier_shipment" ("id" text not null, "carrier_code" text not null, "medusa_fulfillment_id" text null, "return_id" text null, "order_id" text not null, "merchant_reference" text not null, "create_state" text check ("create_state" in ('PENDING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN')) not null default 'PENDING', "status" text check ("status" in ('CREATED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNING', 'RETURNED', 'CANCELLED', 'EXCEPTION')) not null default 'CREATED', "tracking_number" text null, "carrier_order_id" text null, "request" jsonb not null, "attempts" integer not null default 0, "last_error" text null, "last_event_at" timestamptz null, "last_polled_at" timestamptz null, "delivered_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "carrier_shipment_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_carrier_shipment_deleted_at" ON "carrier_shipment" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_carrier_shipment_fulfillment_unique" ON "carrier_shipment" ("carrier_code", "medusa_fulfillment_id") WHERE deleted_at IS NULL AND medusa_fulfillment_id IS NOT NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_carrier_shipment_return_unique" ON "carrier_shipment" ("carrier_code", "return_id") WHERE deleted_at IS NULL AND return_id IS NOT NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_carrier_shipment_merchant_ref_unique" ON "carrier_shipment" ("merchant_reference") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_carrier_shipment_tracking" ON "carrier_shipment" ("carrier_code", "tracking_number") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_carrier_shipment_order" ON "carrier_shipment" ("order_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_carrier_shipment_status" ON "carrier_shipment" ("status", "last_event_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fulfillment_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fulfillment_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fulfillment_idempotency_record_deleted_at" ON "fulfillment_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fulfillment_idempotency_record_scope_key_unique" ON "fulfillment_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "fulfillment_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fulfillment_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fulfillment_outbox_event_deleted_at" ON "fulfillment_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fulfillment_outbox_event_event_id_unique" ON "fulfillment_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fulfillment_outbox_event_pending" ON "fulfillment_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "tracking_event" ("id" text not null, "shipment_id" text not null, "event_hash" text not null, "carrier_status" text not null, "description" text null, "canonical_status" text null, "outcome" text check ("outcome" in ('APPLIED', 'IGNORED')) not null, "ignored_reason" text null, "occurred_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tracking_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_tracking_event_deleted_at" ON "tracking_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tracking_event_unique" ON "tracking_event" ("shipment_id", "event_hash") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_tracking_event_shipment" ON "tracking_event" ("shipment_id", "occurred_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "carrier_shipment" cascade;`);

    this.addSql(
      `drop table if exists "fulfillment_idempotency_record" cascade;`
    );

    this.addSql(`drop table if exists "fulfillment_outbox_event" cascade;`);

    this.addSql(`drop table if exists "tracking_event" cascade;`);
  }
}
