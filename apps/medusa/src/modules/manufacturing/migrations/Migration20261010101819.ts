import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010101819 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "work_center" drop constraint if exists "work_center_code_unique";`
    );
    this.addSql(
      `alter table if exists "routing_operation" drop constraint if exists "routing_operation_seq_unique";`
    );
    this.addSql(
      `alter table if exists "routing" drop constraint if exists "routing_sku_version_unique";`
    );
    this.addSql(
      `alter table if exists "production_batch" drop constraint if exists "production_batch_no_unique";`
    );
    this.addSql(
      `alter table if exists "packing_record" drop constraint if exists "packing_record_no_unique";`
    );
    this.addSql(
      `alter table if exists "mo_material_requirement" drop constraint if exists "mo_requirement_unique";`
    );
    this.addSql(
      `alter table if exists "material_planning_param" drop constraint if exists "material_planning_param_unique";`
    );
    this.addSql(
      `alter table if exists "manufacturing_outbox_event" drop constraint if exists "manufacturing_outbox_event_event_id_unique";`
    );
    this.addSql(
      `alter table if exists "manufacturing_order" drop constraint if exists "mo_number_unique";`
    );
    this.addSql(
      `alter table if exists "manufacturing_idempotency_record" drop constraint if exists "manufacturing_idempotency_record_scope_key_unique";`
    );
    this.addSql(
      `alter table if exists "cut_plan" drop constraint if exists "cut_plan_batch_unique";`
    );
    this.addSql(
      `alter table if exists "bundle" drop constraint if exists "bundle_code_unique";`
    );
    this.addSql(
      `alter table if exists "bom_line" drop constraint if exists "bom_line_no_unique";`
    );
    this.addSql(
      `alter table if exists "bom" drop constraint if exists "bom_sku_version_unique";`
    );
    this.addSql(
      `create table if not exists "bom" ("id" text not null, "product_sku" text not null, "version" integer not null, "status" text check ("status" in ('DRAFT', 'RELEASED', 'OBSOLETE')) not null default 'DRAFT', "output_uom" text not null default 'pcs', "notes" text null, "created_by" text not null, "released_by" text null, "released_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bom_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bom_deleted_at" ON "bom" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bom_sku_version_unique" ON "bom" ("product_sku", "version") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bom_sku_status" ON "bom" ("product_sku", "status") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "bom_line" ("id" text not null, "bom_id" text not null, "line_no" integer not null, "material_id" text not null, "uom" text not null, "qty_per_unit" numeric not null, "waste_factor" numeric not null default 0, "raw_qty_per_unit" jsonb not null, "raw_waste_factor" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bom_line_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bom_line_deleted_at" ON "bom_line" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bom_line_no_unique" ON "bom_line" ("bom_id", "line_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bom_line_material" ON "bom_line" ("material_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "bundle" ("id" text not null, "bundle_code" text not null, "mo_id" text not null, "batch_id" text not null, "sku" text not null, "parent_bundle_id" text null, "qty" integer not null, "current_seq" integer not null default 1, "waiting_qty" integer not null default 0, "buffer_qty" integer not null default 0, "rework_qty" integer not null default 0, "reject_qty" integer not null default 0, "rework_out_qty" integer not null default 0, "qc_released_qty" integer not null default 0, "packed_qty" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bundle_deleted_at" ON "bundle" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bundle_code_unique" ON "bundle" ("bundle_code") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bundle_mo" ON "bundle" ("mo_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_bundle_batch" ON "bundle" ("batch_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "cut_plan" ("id" text not null, "batch_id" text not null, "mo_id" text not null, "status" text check ("status" in ('PLANNED', 'CUT')) not null default 'PLANNED', "lays" jsonb not null, "planned_consumption" numeric not null, "fabric_material_id" text not null, "actual_consumption" numeric null, "raw_planned_consumption" jsonb not null, "raw_actual_consumption" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cut_plan_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_cut_plan_deleted_at" ON "cut_plan" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cut_plan_batch_unique" ON "cut_plan" ("batch_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "manufacturing_exception" ("id" text not null, "mo_id" text not null, "type" text not null, "status" text check ("status" in ('OPEN', 'RESOLVED')) not null default 'OPEN', "detail" jsonb not null, "resolved_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manufacturing_exception_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_manufacturing_exception_deleted_at" ON "manufacturing_exception" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mfg_exception_mo" ON "manufacturing_exception" ("mo_id", "status") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "manufacturing_idempotency_record" ("id" text not null, "scope" text not null, "idempotency_key" text not null, "request_hash" text not null, "response" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manufacturing_idempotency_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_manufacturing_idempotency_record_deleted_at" ON "manufacturing_idempotency_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_manufacturing_idempotency_record_scope_key_unique" ON "manufacturing_idempotency_record" ("scope", "idempotency_key") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "manufacturing_order" ("id" text not null, "mo_number" text not null, "order_type" text check ("order_type" in ('MTS', 'MTO', 'REPLENISHMENT', 'SAMPLE', 'REWORK')) not null default 'MTS', "status" text check ("status" in ('DRAFT', 'PLANNED', 'MATERIAL_CHECK', 'MATERIAL_RESERVED', 'RELEASED', 'IN_PROGRESS', 'QC_PENDING', 'PACKING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'ON_HOLD', 'CANCELLED', 'FAILED')) not null default 'DRAFT', "held_from_status" text null, "product_sku" text not null, "lines" jsonb not null, "planned_qty" integer not null, "completed_qty" integer not null default 0, "bom_id" text not null, "bom_version" integer not null, "routing_id" text not null, "routing_version" integer not null, "material_status" text check ("material_status" in ('UNKNOWN', 'READY', 'PARTIAL', 'SHORTAGE')) not null default 'UNKNOWN', "customer_order_id" text null, "due_date" timestamptz null, "notes" text null, "created_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manufacturing_order_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_manufacturing_order_deleted_at" ON "manufacturing_order" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mo_number_unique" ON "manufacturing_order" ("mo_number") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mo_status" ON "manufacturing_order" ("status") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mo_customer_order" ON "manufacturing_order" ("customer_order_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mo_product_sku" ON "manufacturing_order" ("product_sku") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "manufacturing_outbox_event" ("id" text not null, "event_id" text not null, "event_type" text not null, "event_version" integer not null default 1, "aggregate_type" text not null, "aggregate_id" text not null, "topic" text not null, "partition_key" text not null, "payload" jsonb not null, "status" text check ("status" in ('PENDING', 'PUBLISHED', 'FAILED')) not null default 'PENDING', "attempts" integer not null default 0, "available_at" timestamptz not null, "published_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "manufacturing_outbox_event_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_manufacturing_outbox_event_deleted_at" ON "manufacturing_outbox_event" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_manufacturing_outbox_event_event_id_unique" ON "manufacturing_outbox_event" ("event_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_manufacturing_outbox_event_pending" ON "manufacturing_outbox_event" ("status", "available_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "material_planning_param" ("id" text not null, "material_id" text not null, "safety_stock" numeric not null default 0, "lead_time_days" integer not null default 0, "raw_safety_stock" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "material_planning_param_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_material_planning_param_deleted_at" ON "material_planning_param" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_planning_param_unique" ON "material_planning_param" ("material_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "mo_material_requirement" ("id" text not null, "mo_id" text not null, "material_id" text not null, "uom" text not null, "required_qty" numeric not null, "reserved_qty" numeric not null default 0, "issued_qty" numeric not null default 0, "reservation_id" text null, "availability_status" text check ("availability_status" in ('UNKNOWN', 'READY', 'SHORTAGE')) not null default 'UNKNOWN', "raw_required_qty" jsonb not null, "raw_reserved_qty" jsonb not null default '{"value":"0","precision":20}', "raw_issued_qty" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mo_material_requirement_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mo_material_requirement_deleted_at" ON "mo_material_requirement" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mo_requirement_unique" ON "mo_material_requirement" ("mo_id", "material_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "mrp_run" ("id" text not null, "run_no" text not null, "status" text check ("status" in ('COMPLETED', 'FAILED')) not null default 'COMPLETED', "parameters" jsonb null, "summary" jsonb null, "created_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mrp_run_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mrp_run_deleted_at" ON "mrp_run" ("deleted_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "mrp_suggestion" ("id" text not null, "run_id" text not null, "type" text check ("type" in ('PURCHASE', 'TRANSFER', 'PRODUCE', 'RESCHEDULE')) not null, "material_id" text not null, "gross_requirement" numeric not null, "available" numeric not null, "confirmed_incoming" numeric not null, "safety_buffer" numeric not null, "net_requirement" numeric not null, "suggested_qty" numeric not null, "status" text check ("status" in ('PENDING', 'APPROVED', 'REJECTED')) not null default 'PENDING', "decided_by" text null, "mo_ids" jsonb null, "raw_gross_requirement" jsonb not null, "raw_available" jsonb not null, "raw_confirmed_incoming" jsonb not null, "raw_safety_buffer" jsonb not null, "raw_net_requirement" jsonb not null, "raw_suggested_qty" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mrp_suggestion_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mrp_suggestion_deleted_at" ON "mrp_suggestion" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_mrp_suggestion_run" ON "mrp_suggestion" ("run_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "operation_execution" ("id" text not null, "bundle_id" text not null, "mo_id" text not null, "op_seq" integer not null, "op_code" text not null, "work_center_id" text null, "input_qty" integer not null, "good_qty" integer not null, "rework_qty" integer not null default 0, "reject_qty" integer not null default 0, "standard_minutes_total" numeric not null default 0, "actor_id" text not null, "idempotency_key" text not null, "occurred_at" timestamptz not null, "raw_standard_minutes_total" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "operation_execution_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_operation_execution_deleted_at" ON "operation_execution" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_op_execution_bundle" ON "operation_execution" ("bundle_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_op_execution_wc" ON "operation_execution" ("work_center_id", "occurred_at") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "packing_record" ("id" text not null, "pack_no" text not null, "bundle_id" text not null, "mo_id" text not null, "batch_id" text not null, "sku" text not null, "qty" integer not null, "packed_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "packing_record_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_packing_record_deleted_at" ON "packing_record" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_packing_record_no_unique" ON "packing_record" ("pack_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_packing_record_mo" ON "packing_record" ("mo_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "production_batch" ("id" text not null, "mo_id" text not null, "batch_no" text not null, "planned_qty" integer not null, "status" text check ("status" in ('OPEN', 'CUT', 'CLOSED')) not null default 'OPEN', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "production_batch_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_production_batch_deleted_at" ON "production_batch" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_production_batch_no_unique" ON "production_batch" ("batch_no") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_production_batch_mo" ON "production_batch" ("mo_id") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "routing" ("id" text not null, "product_sku" text not null, "version" integer not null, "status" text check ("status" in ('DRAFT', 'RELEASED', 'OBSOLETE')) not null default 'DRAFT', "notes" text null, "created_by" text not null, "released_by" text null, "released_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "routing_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_routing_deleted_at" ON "routing" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_routing_sku_version_unique" ON "routing" ("product_sku", "version") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_routing_sku_status" ON "routing" ("product_sku", "status") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "routing_operation" ("id" text not null, "routing_id" text not null, "seq" integer not null, "code" text not null, "name" text not null, "work_center_type" text not null, "standard_minutes" numeric not null default 0, "qc_gate" boolean not null default false, "raw_standard_minutes" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "routing_operation_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_routing_operation_deleted_at" ON "routing_operation" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_routing_operation_seq_unique" ON "routing_operation" ("routing_id", "seq") WHERE deleted_at IS NULL;`
    );

    this.addSql(
      `create table if not exists "work_center" ("id" text not null, "code" text not null, "name" text not null, "type" text not null, "capacity_minutes_per_day" integer not null default 480, "efficiency_pct" integer not null default 85, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "work_center_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_work_center_deleted_at" ON "work_center" ("deleted_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_work_center_code_unique" ON "work_center" ("code") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_work_center_type" ON "work_center" ("type") WHERE deleted_at IS NULL;`
    );

    this
      .addSql(`create or replace function fashion_guard_released_parent() returns trigger as $$
declare parent_status text; pid text;
begin
  pid := coalesce(to_jsonb(NEW)->>TG_ARGV[1], to_jsonb(OLD)->>TG_ARGV[1]);
  execute format('select status from %I where id = $1', TG_ARGV[0]) into parent_status using pid;
  if parent_status is distinct from 'DRAFT' then
    raise exception '% rows are immutable once the parent % is %', TG_TABLE_NAME, TG_ARGV[0], parent_status using errcode = 'restrict_violation';
  end if;
  return coalesce(NEW, OLD);
end; $$ language plpgsql;`);
    this
      .addSql(`create or replace function fashion_guard_released_header() returns trigger as $$
begin
  if OLD.status <> 'DRAFT' and (NEW.product_sku is distinct from OLD.product_sku or NEW.version is distinct from OLD.version) then
    raise exception '% % v% is immutable once released', TG_TABLE_NAME, OLD.product_sku, OLD.version using errcode = 'restrict_violation';
  end if;
  if OLD.status = 'RELEASED' and NEW.status = 'DRAFT' then
    raise exception 'a released % cannot go back to DRAFT', TG_TABLE_NAME using errcode = 'restrict_violation';
  end if;
  return NEW;
end; $$ language plpgsql;`);
    this.addSql(
      `drop trigger if exists "bom_line_released_guard" on "bom_line";`
    );
    this.addSql(
      `create trigger "bom_line_released_guard" before insert or update or delete on "bom_line" for each row execute function fashion_guard_released_parent('bom', 'bom_id');`
    );
    this.addSql(
      `drop trigger if exists "routing_operation_released_guard" on "routing_operation";`
    );
    this.addSql(
      `create trigger "routing_operation_released_guard" before insert or update or delete on "routing_operation" for each row execute function fashion_guard_released_parent('routing', 'routing_id');`
    );
    this.addSql(`drop trigger if exists "bom_released_guard" on "bom";`);
    this.addSql(
      `create trigger "bom_released_guard" before update on "bom" for each row execute function fashion_guard_released_header();`
    );
    this.addSql(
      `drop trigger if exists "routing_released_guard" on "routing";`
    );
    this.addSql(
      `create trigger "routing_released_guard" before update on "routing" for each row execute function fashion_guard_released_header();`
    );
    this.addSql(
      `alter table "bundle" drop constraint if exists "bundle_quantity_conservation";`
    );
    this.addSql(
      `alter table "bundle" add constraint "bundle_quantity_conservation" check (waiting_qty >= 0 and buffer_qty >= 0 and rework_qty >= 0 and reject_qty >= 0 and rework_out_qty >= 0 and qc_released_qty >= 0 and packed_qty >= 0 and waiting_qty + buffer_qty + rework_qty + reject_qty + rework_out_qty + qc_released_qty = qty and packed_qty <= qc_released_qty);`
    );
    this.addSql(
      `alter table "operation_execution" drop constraint if exists "operation_execution_conservation";`
    );
    this.addSql(
      `alter table "operation_execution" add constraint "operation_execution_conservation" check (input_qty > 0 and good_qty >= 0 and rework_qty >= 0 and reject_qty >= 0 and good_qty + rework_qty + reject_qty <= input_qty);`
    );
    this.addSql(
      `alter table "manufacturing_order" drop constraint if exists "manufacturing_order_qty_positive";`
    );
    this.addSql(
      `alter table "manufacturing_order" add constraint "manufacturing_order_qty_positive" check (planned_qty > 0 and completed_qty >= 0);`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bom" cascade;`);

    this.addSql(`drop table if exists "bom_line" cascade;`);

    this.addSql(`drop table if exists "bundle" cascade;`);

    this.addSql(`drop table if exists "cut_plan" cascade;`);

    this.addSql(`drop table if exists "manufacturing_exception" cascade;`);

    this.addSql(
      `drop table if exists "manufacturing_idempotency_record" cascade;`
    );

    this.addSql(`drop table if exists "manufacturing_order" cascade;`);

    this.addSql(`drop table if exists "manufacturing_outbox_event" cascade;`);

    this.addSql(`drop table if exists "material_planning_param" cascade;`);

    this.addSql(`drop table if exists "mo_material_requirement" cascade;`);

    this.addSql(`drop table if exists "mrp_run" cascade;`);

    this.addSql(`drop table if exists "mrp_suggestion" cascade;`);

    this.addSql(`drop table if exists "operation_execution" cascade;`);

    this.addSql(`drop table if exists "packing_record" cascade;`);

    this.addSql(`drop table if exists "production_batch" cascade;`);

    this.addSql(`drop table if exists "routing" cascade;`);

    this.addSql(`drop table if exists "routing_operation" cascade;`);

    this.addSql(`drop table if exists "work_center" cascade;`);
  }
}
