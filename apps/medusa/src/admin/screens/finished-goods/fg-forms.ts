import type { FieldConfig } from "../../lib/erp/form-fields";

const FG_LOCATION_KINDS = [
  "FACTORY",
  "FULFILLMENT",
  "IN_TRANSIT",
  "RETURN_QC",
  "QUARANTINE",
  "SHOWROOM",
] as const;

const skuAndLocation: readonly FieldConfig[] = [
  { name: "sku", label: "SKU", required: true },
  {
    name: "location_id",
    label: "Location",
    type: "lookup",
    ref: "fgLocation",
    required: true,
  },
];

export const holdFields: readonly FieldConfig[] = [
  ...skuAndLocation,
  { name: "qty", label: "Quantity", type: "integer", required: true },
  {
    name: "kind",
    label: "Hold kind",
    type: "select",
    required: true,
    options: ["WAREHOUSE", "QC"],
  },
  {
    name: "action",
    label: "Action",
    type: "select",
    required: true,
    options: ["HOLD", "RELEASE"],
  },
  { name: "reason", label: "Reason", type: "textarea", required: true },
];

export const adjustFields: readonly FieldConfig[] = [
  ...skuAndLocation,
  {
    name: "direction",
    label: "Direction",
    type: "select",
    required: true,
    options: ["PLUS", "MINUS"],
  },
  { name: "qty", label: "Quantity", type: "integer", required: true },
  { name: "reason", label: "Reason", type: "textarea", required: true },
];

export const safetyStockFields: readonly FieldConfig[] = [
  ...skuAndLocation,
  {
    name: "safety_stock",
    label: "Safety stock",
    type: "integer",
    required: true,
  },
];

export const allocateFields: readonly FieldConfig[] = [
  { name: "order_id", label: "Customer order id", required: true },
  ...skuAndLocation,
  { name: "qty", label: "Quantity", type: "integer", required: true },
];

export const fgLocationFields: readonly FieldConfig[] = [
  { name: "code", label: "Code", required: true },
  { name: "name", label: "Name", required: true },
  { name: "warehouse_code", label: "Warehouse code", required: true },
  { name: "country_code", label: "Country (2 letters)", placeholder: "VN" },
  { name: "kind", label: "Kind", type: "select", options: FG_LOCATION_KINDS },
  {
    name: "is_commerce",
    label: "Sellable: feeds the storefront stock",
    type: "checkbox",
    defaultValue: true,
  },
  { name: "medusa_stock_location_id", label: "Medusa stock location id" },
];

export const fgDispatchFields: readonly FieldConfig[] = [
  { name: "sku", label: "SKU", required: true },
  { name: "qty", label: "Quantity", type: "integer", required: true },
  {
    name: "from_location_id",
    label: "From",
    type: "lookup",
    ref: "fgLocation",
    required: true,
  },
  {
    name: "to_location_id",
    label: "To",
    type: "lookup",
    ref: "fgLocation",
    required: true,
  },
  {
    name: "transit_location_id",
    label: "Transit location",
    type: "lookup",
    ref: "fgLocation",
    help: "Optional.",
  },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const republishFields: readonly FieldConfig[] = [
  { name: "sku", label: "SKU (empty = all SKUs)" },
];
