import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010200220 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "supplier" add column if not exists "tax_code" text null, add column if not exists "default_currency_code" text null, add column if not exists "lead_time_days" integer null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "supplier" drop column if exists "tax_code", drop column if exists "default_currency_code", drop column if exists "lead_time_days";`
    );
  }
}
