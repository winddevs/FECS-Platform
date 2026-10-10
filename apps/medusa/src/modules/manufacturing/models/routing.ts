import { model } from "@medusajs/framework/utils";

import { VERSIONED_STATUSES } from "./bom";

export const Routing = model
  .define("routing", {
    id: model.id({ prefix: "rtg" }).primaryKey(),
    product_sku: model.text(),
    version: model.number(),
    status: model.enum([...VERSIONED_STATUSES]).default("DRAFT"),
    notes: model.text().nullable(),
    created_by: model.text(),
    released_by: model.text().nullable(),
    released_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_routing_sku_version_unique",
      on: ["product_sku", "version"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_routing_sku_status", on: ["product_sku", "status"] },
  ]);

/** Operation sequence with work-center type, standard time and QC gates. */
export const RoutingOperation = model
  .define("routing_operation", {
    id: model.id({ prefix: "rtgop" }).primaryKey(),
    routing_id: model.text(),
    seq: model.number(),
    code: model.text(),
    name: model.text(),
    work_center_type: model.text(),
    /** Standard minutes per finished unit. */
    standard_minutes: model.bigNumber().default(0),
    /** A QC gate operation is completed by an inspection, not by an operator. */
    qc_gate: model.boolean().default(false),
  })
  .indexes([
    {
      name: "IDX_routing_operation_seq_unique",
      on: ["routing_id", "seq"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export const WorkCenter = model
  .define("work_center", {
    id: model.id({ prefix: "wc" }).primaryKey(),
    code: model.text(),
    name: model.text(),
    type: model.text(),
    capacity_minutes_per_day: model.number().default(480),
    /** Efficiency in percent applied to nominal capacity. */
    efficiency_pct: model.number().default(85),
    is_active: model.boolean().default(true),
  })
  .indexes([
    {
      name: "IDX_work_center_code_unique",
      on: ["code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    { name: "IDX_work_center_type", on: ["type"] },
  ]);
