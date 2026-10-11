import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010202955 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "customer_channel_identity" add column if not exists "muted_categories" jsonb null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "customer_channel_identity" drop column if exists "muted_categories";`
    );
  }
}
