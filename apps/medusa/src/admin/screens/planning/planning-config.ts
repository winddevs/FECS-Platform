import type { FieldConfig } from "../../lib/erp/form-fields";
import type {
  ColumnConfig,
  ResourceConfig,
} from "../../lib/erp/resource-types";

const VERSION_STATUSES = ["DRAFT", "RELEASED", "OBSOLETE"] as const;
const SUGGESTION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const MFG = "/admin/manufacturing";

const versionColumns: readonly ColumnConfig[] = [
  { key: "product_sku", label: "Product SKU", kind: "code" },
  { key: "version", label: "Version", kind: "number" },
  { key: "status", label: "Status", kind: "status" },
  { key: "created_by", label: "Created by", kind: "code" },
  { key: "released_by", label: "Released by", kind: "code" },
  { key: "released_at", label: "Released", kind: "datetime" },
  { key: "notes", label: "Notes" },
];

export const bomsList: ResourceConfig = {
  id: "boms",
  title: "Bills of materials",
  endpoint: `${MFG}/boms`,
  responseKey: "boms",
  order: "-created_at",
  columns: [
    ...versionColumns.slice(0, 3),
    { key: "output_uom", label: "Output UoM" },
    ...versionColumns.slice(4, 6),
  ],
  filters: [
    { key: "product_sku", label: "Product SKU" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: VERSION_STATUSES,
    },
  ],
};

export const routingsList: ResourceConfig = {
  id: "routings",
  title: "Routings",
  endpoint: `${MFG}/routings`,
  responseKey: "routings",
  order: "-created_at",
  columns: [...versionColumns.slice(0, 3), ...versionColumns.slice(4, 6)],
  filters: [
    { key: "product_sku", label: "Product SKU" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: VERSION_STATUSES,
    },
  ],
};

export const bomHeaderColumns: readonly ColumnConfig[] = [
  ...versionColumns.slice(0, 3),
  { key: "output_uom", label: "Output UoM" },
  ...versionColumns.slice(3),
];

export const routingHeaderColumns: readonly ColumnConfig[] = versionColumns;

export const bomLineColumns: readonly ColumnConfig[] = [
  { key: "line_no", label: "#", kind: "number" },
  { key: "material_id", label: "Material", kind: "ref", ref: "material" },
  { key: "uom", label: "UoM" },
  { key: "qty_per_unit", label: "Qty per unit", kind: "number" },
  { key: "waste_factor", label: "Waste factor", kind: "number" },
];

export const routingOperationColumns: readonly ColumnConfig[] = [
  { key: "seq", label: "Seq", kind: "number" },
  { key: "code", label: "Code", kind: "code" },
  { key: "name", label: "Name" },
  { key: "work_center_type", label: "Work center type" },
  { key: "standard_minutes", label: "Standard minutes", kind: "number" },
  { key: "qc_gate", label: "QC gate", kind: "boolean" },
];

export const mrpRunsList: ResourceConfig = {
  id: "mrp-runs",
  title: "MRP runs",
  endpoint: `${MFG}/mrp/runs`,
  responseKey: "mrp_runs",
  order: "-created_at",
  columns: [
    { key: "run_no", label: "Run", kind: "code" },
    { key: "status", label: "Status", kind: "status" },
    { key: "created_at", label: "Run at", kind: "datetime" },
    { key: "created_by", label: "By", kind: "code" },
    { key: "summary", label: "Summary", kind: "json" },
  ],
};

export const mrpSuggestionsList: ResourceConfig = {
  id: "mrp-suggestions",
  title: "MRP suggestions",
  endpoint: `${MFG}/mrp/suggestions`,
  responseKey: "suggestions",
  order: "-created_at",
  defaultFilters: { status: "PENDING" },
  columns: [
    { key: "type", label: "Type", kind: "status" },
    { key: "material_id", label: "Material", kind: "ref", ref: "material" },
    { key: "sku", label: "SKU", kind: "code" },
    { key: "gross_requirement", label: "Gross", kind: "number" },
    { key: "available", label: "Available", kind: "number" },
    { key: "confirmed_incoming", label: "Incoming", kind: "number" },
    { key: "safety_buffer", label: "Safety", kind: "number" },
    { key: "net_requirement", label: "Net", kind: "number" },
    { key: "suggested_qty", label: "Suggested", kind: "number" },
    { key: "status", label: "Status", kind: "status" },
    { key: "run_id", label: "Run id", kind: "code" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: SUGGESTION_STATUSES,
    },
    { key: "run_id", label: "Run id" },
    { key: "material_id", label: "Material id" },
  ],
};

export const skuParamsList: ResourceConfig = {
  id: "sku-params",
  title: "SKU reorder rules",
  endpoint: `${MFG}/planning-params/skus`,
  responseKey: "sku_planning_params",
  columns: [
    { key: "sku", label: "SKU", kind: "code" },
    { key: "reorder_point", label: "Reorder point", kind: "number" },
    { key: "reorder_qty", label: "Reorder quantity", kind: "number" },
  ],
  filters: [{ key: "sku", label: "SKU" }],
};

export const workCentersList: ResourceConfig = {
  id: "work-centers",
  title: "Work centers",
  endpoint: `${MFG}/work-centers`,
  responseKey: "work_centers",
  columns: [
    { key: "code", label: "Code", kind: "code" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    {
      key: "capacity_minutes_per_day",
      label: "Capacity (min/day)",
      kind: "number",
    },
    { key: "efficiency_pct", label: "Efficiency %", kind: "number" },
    { key: "is_active", label: "Active", kind: "boolean" },
  ],
  filters: [{ key: "type", label: "Type" }],
};

export const workCenterLoadList: ResourceConfig = {
  id: "work-center-load",
  title: "Load by work center",
  endpoint: `${MFG}/work-centers/load`,
  responseKey: "work_centers",
  columns: [
    { key: "code", label: "Code", kind: "code" },
    { key: "type", label: "Type" },
    { key: "is_active", label: "Active", kind: "boolean" },
    {
      key: "effective_capacity_minutes",
      label: "Effective capacity (min)",
      kind: "number",
    },
    { key: "load_minutes", label: "Load (min)", kind: "number" },
    { key: "available_minutes", label: "Available (min)", kind: "number" },
    { key: "utilization_pct", label: "Utilization %", kind: "number" },
    { key: "over_capacity", label: "Over capacity", kind: "boolean" },
  ],
};

export const bomFields: readonly FieldConfig[] = [
  { name: "product_sku", label: "Product SKU", required: true },
  { name: "output_uom", label: "Output UoM", placeholder: "pcs" },
  { name: "notes", label: "Notes", type: "textarea" },
  {
    name: "lines",
    label: "Component",
    type: "lines",
    required: true,
    fields: [
      {
        name: "material_id",
        label: "Material",
        type: "lookup",
        ref: "material",
        required: true,
      },
      { name: "uom", label: "UoM", required: true },
      {
        name: "qty_per_unit",
        label: "Quantity per unit",
        type: "number",
        required: true,
      },
      { name: "waste_factor", label: "Waste factor (0-1)", type: "number" },
    ],
  },
];

export const routingFields: readonly FieldConfig[] = [
  { name: "product_sku", label: "Product SKU", required: true },
  { name: "notes", label: "Notes", type: "textarea" },
  {
    name: "operations",
    label: "Operation",
    type: "lines",
    required: true,
    fields: [
      { name: "seq", label: "Sequence", type: "integer", required: true },
      { name: "code", label: "Code", required: true },
      { name: "name", label: "Name", required: true },
      { name: "work_center_type", label: "Work center type", required: true },
      { name: "standard_minutes", label: "Standard minutes", type: "number" },
      {
        name: "qc_gate",
        label: "QC gate after this operation",
        type: "checkbox",
      },
    ],
  },
];

export const mrpRunFields: readonly FieldConfig[] = [
  { name: "demand_warehouse", label: "Demand warehouse code (optional)" },
];

export const materialParamFields: readonly FieldConfig[] = [
  {
    name: "material_id",
    label: "Material",
    type: "lookup",
    ref: "material",
    required: true,
  },
  {
    name: "safety_stock",
    label: "Safety stock",
    type: "number",
    required: true,
  },
  {
    name: "lead_time_days",
    label: "Lead time (days)",
    type: "integer",
    required: true,
  },
];

export const skuParamFields: readonly FieldConfig[] = [
  { name: "sku", label: "SKU", required: true },
  {
    name: "reorder_point",
    label: "Reorder point",
    type: "integer",
    required: true,
  },
  {
    name: "reorder_qty",
    label: "Reorder quantity",
    type: "integer",
    required: true,
  },
];

export const workCenterFields: readonly FieldConfig[] = [
  { name: "code", label: "Code", required: true },
  { name: "name", label: "Name", required: true },
  { name: "type", label: "Type", required: true, placeholder: "SEWING" },
  {
    name: "capacity_minutes_per_day",
    label: "Capacity (minutes/day)",
    type: "integer",
  },
  { name: "efficiency_pct", label: "Efficiency %", type: "integer" },
];
