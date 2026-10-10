import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010182848 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "fg_location" drop constraint if exists "fg_location_medusa_stock_location_unique";`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fg_location_medusa_stock_location_unique" ON "fg_location" ("medusa_stock_location_id") WHERE deleted_at IS NULL AND medusa_stock_location_id IS NOT NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_fg_location_medusa_stock_location_unique";`
    );
  }
}
