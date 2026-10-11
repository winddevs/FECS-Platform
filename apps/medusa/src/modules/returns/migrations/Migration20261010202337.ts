import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010202337 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "return_authorization" add column if not exists "replacement_shipment_id" text null, add column if not exists "replacement_shipped_at" timestamptz null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "return_authorization" drop column if exists "replacement_shipment_id", drop column if exists "replacement_shipped_at";`
    );
  }
}
