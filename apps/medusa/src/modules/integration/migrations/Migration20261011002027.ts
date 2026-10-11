import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261011002027 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "kafka_relay_event" drop constraint if exists "kafka_relay_event_event_id_unique";`
    );
    this.addSql(
      `create table if not exists "kafka_relay_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "kafka_relay_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_kafka_relay_event_deleted_at" ON "kafka_relay_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_kafka_relay_event_event_id_unique" ON "kafka_relay_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_kafka_relay_event_pending" ON "kafka_relay_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "kafka_relay_event" cascade;`);
  }
}
