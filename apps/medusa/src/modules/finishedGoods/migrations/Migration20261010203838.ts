import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010203838 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "fg_location" add column if not exists "country_code" text null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "fg_location" drop column if exists "country_code";`
    );
  }
}
