import type { FieldConfig } from "../../lib/erp/form-fields";
import type {
  ColumnConfig,
  ResourceConfig,
} from "../../lib/erp/resource-types";

const MFG = "/admin/manufacturing";

export const bundleColumns: readonly ColumnConfig[] = [
  { key: "bundle_code", label: "Bundle", kind: "code" },
  { key: "sku", label: "SKU", kind: "code" },
  { key: "qty", label: "Qty", kind: "number" },
  { key: "current_seq", label: "At operation", kind: "number" },
  { key: "waiting_qty", label: "Waiting", kind: "number" },
  { key: "buffer_qty", label: "Buffer", kind: "number" },
  { key: "rework_qty", label: "Rework", kind: "number" },
  { key: "reject_qty", label: "Reject", kind: "number" },
  { key: "rework_out_qty", label: "Rework out", kind: "number" },
  { key: "qc_released_qty", label: "QC released", kind: "number" },
  { key: "packed_qty", label: "Packed", kind: "number" },
];

export const stationMoColumns: readonly ColumnConfig[] = [
  { key: "mo_number", label: "MO", kind: "code" },
  { key: "status", label: "MO status", kind: "status" },
  { key: "product_sku", label: "Product SKU", kind: "code" },
];

export const currentOperationColumns: readonly ColumnConfig[] = [
  { key: "seq", label: "Seq", kind: "number" },
  { key: "code", label: "Code", kind: "code" },
  { key: "name", label: "Name" },
  { key: "work_center_type", label: "Work center type" },
  { key: "standard_minutes", label: "Standard minutes", kind: "number" },
  { key: "qc_gate", label: "QC gate", kind: "boolean" },
];

export const bundlesList: ResourceConfig = {
  id: "bundles",
  title: "Bundles",
  endpoint: `${MFG}/bundles`,
  responseKey: "bundles",
  order: "-created_at",
  columns: [...bundleColumns, { key: "mo_id", label: "MO id", kind: "code" }],
  filters: [
    { key: "sku", label: "SKU" },
    { key: "mo_id", label: "MO id" },
    { key: "batch_id", label: "Batch id" },
  ],
};

export const inspectionsList: ResourceConfig = {
  id: "inspections",
  title: "Inspections",
  endpoint: "/admin/quality/inspections",
  responseKey: "inspections",
  order: "-created_at",
  columns: [
    { key: "inspection_no", label: "Inspection", kind: "code" },
    { key: "created_at", label: "When", kind: "datetime" },
    { key: "target_id", label: "Target id", kind: "code" },
    { key: "reference_type", label: "Ref type" },
    { key: "reference_id", label: "Ref id", kind: "code" },
    { key: "qty_inspected", label: "Inspected", kind: "number" },
    { key: "pass_qty", label: "Pass", kind: "number" },
    { key: "rework_qty", label: "Rework", kind: "number" },
    { key: "reject_qty", label: "Reject", kind: "number" },
    { key: "hold_qty", label: "Hold", kind: "number" },
    { key: "defects", label: "Defects", kind: "json" },
    { key: "inspector_id", label: "Inspector", kind: "code" },
    { key: "notes", label: "Notes" },
  ],
  filters: [
    { key: "target_id", label: "Target (bundle) id" },
    { key: "reference_id", label: "Reference id" },
  ],
};

export const operationFields: readonly FieldConfig[] = [
  {
    name: "op_seq",
    label: "Operation sequence",
    type: "integer",
    required: true,
  },
  {
    name: "input_qty",
    label: "Input quantity",
    type: "integer",
    required: true,
  },
  { name: "good_qty", label: "Good quantity", type: "integer", required: true },
  { name: "rework_qty", label: "Rework quantity", type: "integer" },
  { name: "reject_qty", label: "Reject quantity", type: "integer" },
  {
    name: "work_center_id",
    label: "Work center",
    type: "lookup",
    ref: "workCenter",
  },
];

export const inspectionFields: readonly FieldConfig[] = [
  { name: "pass_qty", label: "Pass quantity", type: "integer", required: true },
  { name: "rework_qty", label: "Rework quantity", type: "integer" },
  { name: "reject_qty", label: "Reject quantity", type: "integer" },
  { name: "hold_qty", label: "Hold quantity", type: "integer" },
  {
    name: "defects",
    label: "Defect",
    type: "lines",
    fields: [
      { name: "code", label: "Defect code", required: true },
      { name: "qty", label: "Quantity", type: "integer", required: true },
      { name: "note", label: "Note" },
    ],
  },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const reworkFields: readonly FieldConfig[] = [
  {
    name: "good_qty",
    label: "Repaired (good) quantity",
    type: "integer",
    required: true,
  },
  {
    name: "scrap_qty",
    label: "Scrapped quantity",
    type: "integer",
    required: true,
  },
];

export const packFields: readonly FieldConfig[] = [
  { name: "qty", label: "Quantity to pack", type: "integer", required: true },
  {
    name: "location_id",
    label: "Finished-goods location",
    type: "lookup",
    ref: "fgLocation",
    required: true,
  },
];
