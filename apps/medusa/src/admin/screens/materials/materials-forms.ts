import type { FieldConfig } from "../../lib/erp/form-fields";

const BUCKETS = ["GOOD", "QC_HOLD", "DAMAGED"] as const;

export const materialFields: readonly FieldConfig[] = [
  { name: "code", label: "Code", required: true },
  { name: "name", label: "Name", required: true },
  {
    name: "material_type",
    label: "Type",
    type: "select",
    options: ["FABRIC", "TRIM", "PACKAGING", "OTHER"],
  },
  { name: "uom", label: "Unit of measure", required: true, placeholder: "m" },
  {
    name: "track_lot",
    label: "Track lots",
    type: "checkbox",
    defaultValue: true,
  },
  { name: "track_roll", label: "Track rolls", type: "checkbox" },
  { name: "track_dye_lot", label: "Track dye lots", type: "checkbox" },
  { name: "max_dye_lots", label: "Max dye lots per order", type: "integer" },
  {
    name: "allocation_policy",
    label: "Allocation policy",
    type: "select",
    options: ["FIFO", "SAME_DYE_LOT_FIFO"],
  },
  {
    name: "roll_fragment_reduction",
    label: "Reduce roll fragments",
    type: "checkbox",
    defaultValue: true,
  },
];

export const locationFields: readonly FieldConfig[] = [
  { name: "code", label: "Code", required: true },
  { name: "name", label: "Name", required: true },
  { name: "warehouse_code", label: "Warehouse code", required: true },
  {
    name: "kind",
    label: "Kind",
    type: "select",
    options: [
      "RAW_MATERIAL",
      "WIP",
      "QC_HOLD",
      "QUARANTINE",
      "IN_TRANSIT",
      "RETURN_QC",
    ],
  },
];

export const receiveFields: readonly FieldConfig[] = [
  {
    name: "material_id",
    label: "Material",
    type: "lookup",
    ref: "material",
    required: true,
  },
  {
    name: "location_id",
    label: "Location",
    type: "lookup",
    ref: "location",
    required: true,
  },
  {
    name: "lot",
    label: "Lot",
    type: "group",
    required: true,
    fields: [
      { name: "lot_no", label: "Lot number", required: true },
      { name: "dye_lot_no", label: "Dye lot number" },
      {
        name: "supplier_id",
        label: "Supplier",
        type: "lookup",
        ref: "supplier",
      },
      { name: "source_type", label: "Source type" },
      { name: "source_id", label: "Source id" },
    ],
  },
  {
    name: "rolls",
    label: "Roll",
    type: "lines",
    help: "Roll-tracked fabric: one row per roll. Leave empty and use Quantity for other materials.",
    fields: [
      { name: "roll_code", label: "Roll code", required: true },
      { name: "qty", label: "Roll quantity", type: "number", required: true },
      { name: "width_cm", label: "Width (cm)", type: "integer" },
    ],
  },
  { name: "qty", label: "Quantity (no rolls)", type: "number" },
  {
    name: "bucket",
    label: "Stock bucket",
    type: "select",
    options: BUCKETS,
    defaultValue: "GOOD",
  },
  { name: "reference_type", label: "Reference type" },
  { name: "reference_id", label: "Reference id" },
];

export const reserveFields: readonly FieldConfig[] = [
  {
    name: "material_id",
    label: "Material",
    type: "lookup",
    ref: "material",
    required: true,
  },
  { name: "qty", label: "Quantity", type: "number", required: true },
  {
    name: "reference_type",
    label: "Reference type",
    required: true,
    placeholder: "MO",
  },
  { name: "reference_id", label: "Reference id", required: true },
  { name: "reference_line", label: "Reference line" },
  { name: "location_id", label: "Location", type: "lookup", ref: "location" },
  {
    name: "planner_approved",
    label: "Planner approves a dye-lot override",
    type: "checkbox",
    help: "Needs the manufacturing:approve permission.",
  },
];

export const issueFields: readonly FieldConfig[] = [
  { name: "reservation_id", label: "Reservation id", required: true },
  { name: "qty", label: "Quantity", type: "number", required: true },
];

export const releaseReservationFields: readonly FieldConfig[] = [
  { name: "qty", label: "Quantity (empty = all remaining)", type: "number" },
  { name: "reason", label: "Reason", type: "textarea" },
];

const balanceIdField: FieldConfig = {
  name: "balance_id",
  label: "Balance id",
  required: true,
  help: "Open Stock > Balances and click a row to prefill this.",
};

export const cycleCountFields: readonly FieldConfig[] = [
  balanceIdField,
  {
    name: "counted_qty",
    label: "Counted quantity",
    type: "number",
    required: true,
  },
  {
    name: "expected_version",
    label: "Balance version seen",
    type: "integer",
    required: true,
    help: "The count is rejected if the balance changed since this version.",
  },
  { name: "reason", label: "Reason", type: "textarea", required: true },
];

export const adjustmentFields: readonly FieldConfig[] = [
  balanceIdField,
  {
    name: "direction",
    label: "Direction",
    type: "select",
    required: true,
    options: ["PLUS", "MINUS"],
  },
  { name: "qty", label: "Quantity", type: "number", required: true },
  { name: "reason", label: "Reason", type: "textarea", required: true },
];

export const scrapFields: readonly FieldConfig[] = [
  balanceIdField,
  { name: "qty", label: "Quantity", type: "number", required: true },
  {
    name: "source_bucket",
    label: "Scrap from bucket",
    type: "select",
    required: true,
    options: BUCKETS,
  },
  { name: "reason", label: "Reason", type: "textarea", required: true },
  {
    name: "reference_type",
    label: "Business reference type",
    required: true,
    placeholder: "QC_REJECT",
  },
  { name: "reference_id", label: "Business reference id", required: true },
];

export const qcDecisionFields: readonly FieldConfig[] = [
  balanceIdField,
  { name: "qty", label: "Quantity", type: "number", required: true },
  {
    name: "decision",
    label: "Decision",
    type: "select",
    required: true,
    options: ["RELEASE", "REJECT"],
  },
  { name: "reason", label: "Reason", type: "textarea" },
];

export const transferFields: readonly FieldConfig[] = [
  balanceIdField,
  {
    name: "to_location_id",
    label: "To location",
    type: "lookup",
    ref: "location",
    required: true,
  },
  { name: "qty", label: "Quantity", type: "number", required: true },
  { name: "reference_type", label: "Reference type" },
  { name: "reference_id", label: "Reference id" },
];

export const dispatchFields: readonly FieldConfig[] = [
  balanceIdField,
  {
    name: "to_location_id",
    label: "To location",
    type: "lookup",
    ref: "location",
    required: true,
  },
  { name: "qty", label: "Quantity", type: "number", required: true },
  {
    name: "transit_location_id",
    label: "Transit location",
    type: "lookup",
    ref: "location",
    help: "Must be an IN_TRANSIT location. Optional when exactly one exists.",
  },
  { name: "notes", label: "Notes", type: "textarea" },
];
