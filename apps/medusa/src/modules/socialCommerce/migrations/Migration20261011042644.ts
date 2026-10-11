import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261011042644 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "customer_channel_identity" add column if not exists "locale" text null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "customer_channel_identity" drop column if exists "locale";`
    );
  }
}
