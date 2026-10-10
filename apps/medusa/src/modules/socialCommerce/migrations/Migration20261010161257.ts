import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010161257 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "notification_log" drop constraint if exists "notification_log_status_check";`
    );

    this.addSql(
      `alter table if exists "notification_log" add column if not exists "text" text null;`
    );
    this.addSql(
      `alter table if exists "notification_log" add constraint "notification_log_status_check" check("status" in ('PENDING', 'SENT', 'SKIPPED', 'FAILED', 'DEFERRED'));`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "notification_log" drop constraint if exists "notification_log_status_check";`
    );

    this.addSql(
      `alter table if exists "notification_log" drop column if exists "text";`
    );

    this.addSql(
      `alter table if exists "notification_log" add constraint "notification_log_status_check" check("status" in ('PENDING', 'SENT', 'SKIPPED', 'FAILED'));`
    );
  }
}
