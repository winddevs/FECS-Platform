import type { FieldConfig } from "../../lib/erp/form-fields";
import type { Row } from "../../lib/erp/resource-types";

const MO_TYPES = ["MTS", "MTO", "REPLENISHMENT", "SAMPLE", "REWORK"] as const;

export const moFields: readonly FieldConfig[] = [
  {
    name: "order_type",
    label: "Order type",
    type: "select",
    required: true,
    options: MO_TYPES,
  },
  { name: "product_sku", label: "Product SKU", required: true },
  {
    name: "lines",
    label: "SKU line",
    type: "lines",
    required: true,
    fields: [
      { name: "sku", label: "SKU (size/color)", required: true },
      { name: "qty", label: "Quantity", type: "integer", required: true },
    ],
  },
  { name: "due_date", label: "Due date", type: "datetime" },
  { name: "customer_order_id", label: "Customer order id" },
  { name: "source_mo_id", label: "Source MO id (rework)" },
  { name: "bom_id", label: "BOM id (optional, else latest released)" },
  { name: "routing_id", label: "Routing id (optional, else latest released)" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const holdFields: readonly FieldConfig[] = [
  { name: "reason", label: "Reason", type: "textarea", required: true },
];

export const reserveMoFields: readonly FieldConfig[] = [
  {
    name: "planner_approved",
    label: "Planner approves a dye-lot override",
    type: "checkbox",
    help: "Needs the manufacturing:approve permission.",
  },
];

export const releaseMoFields: readonly FieldConfig[] = [
  {
    name: "batches",
    label: "Batch",
    type: "lines",
    help: "Optional. Split the order into production batches; leave empty for one batch.",
    fields: [
      {
        name: "planned_qty",
        label: "Planned quantity",
        type: "integer",
        required: true,
      },
    ],
  },
];

export const issueFabricFields: readonly FieldConfig[] = [
  {
    name: "material_id",
    label: "Material",
    type: "lookup",
    ref: "material",
    required: true,
  },
  { name: "qty", label: "Quantity", type: "number", required: true },
];

const batchOptions = (batches: readonly Row[]) =>
  batches.map((batch) => ({
    value: String(batch.id),
    label: `${String(batch.batch_no)} (${String(batch.status)})`,
  }));

export const cutPlanFields = (
  batches: readonly Row[],
  rolls: readonly Row[]
): FieldConfig[] => [
  {
    name: "batch_id",
    label: "Batch",
    type: "select",
    required: true,
    options: batchOptions(batches),
  },
  {
    name: "fabric_material_id",
    label: "Fabric",
    type: "lookup",
    ref: "material",
    required: true,
  },
  {
    name: "lays",
    label: "Lay",
    type: "lines",
    required: true,
    fields: [
      {
        name: "roll_code",
        label: "Roll",
        type: "select",
        required: true,
        options: rolls.map((roll) => ({
          value: String(roll.roll_code),
          label: `${String(roll.roll_code)} (assigned ${String(roll.assigned)})`,
        })),
      },
      {
        name: "planned_consumption",
        label: "Planned consumption",
        type: "number",
        required: true,
      },
      {
        name: "size_ratio",
        label: "Size ratio (JSON)",
        type: "json",
        required: true,
        placeholder: '{"S": 1, "M": 2, "L": 1}',
      },
    ],
  },
];

export const completeCutFields = (batches: readonly Row[]): FieldConfig[] => [
  {
    name: "batch_id",
    label: "Batch",
    type: "select",
    required: true,
    options: batchOptions(batches),
  },
  {
    name: "fabric_material_id",
    label: "Fabric",
    type: "lookup",
    ref: "material",
    required: true,
  },
  {
    name: "actual_consumption",
    label: "Actual fabric consumption",
    type: "number",
    required: true,
  },
  {
    name: "bundles",
    label: "Bundle",
    type: "lines",
    required: true,
    fields: [
      { name: "sku", label: "SKU", required: true },
      {
        name: "qty",
        label: "Pieces in bundle",
        type: "integer",
        required: true,
      },
    ],
  },
  {
    name: "overproduction_approved",
    label: "Overproduction approved",
    type: "checkbox",
    help: "Needs the manufacturing:approve permission.",
  },
];
