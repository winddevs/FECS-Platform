import type { FieldConfig } from "../../lib/erp/form-fields";
import type {
  ColumnConfig,
  ResourceConfig,
  Row,
} from "../../lib/erp/resource-types";

const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
const PO_STATUSES = [
  "DRAFT",
  "APPROVED",
  "SENT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
] as const;
const RECEIPT_BUCKETS = ["GOOD", "QC_HOLD", "DAMAGED"] as const;

export const suppliersList: ResourceConfig = {
  id: "suppliers",
  title: "Suppliers",
  endpoint: "/admin/procurement/suppliers",
  responseKey: "suppliers",
  columns: [
    { key: "code", label: "Code", kind: "code" },
    { key: "name", label: "Name" },
    { key: "status", label: "Status", kind: "status" },
    { key: "contact_name", label: "Contact" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "default_currency_code", label: "Currency" },
    { key: "lead_time_days", label: "Lead time (days)", kind: "number" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: SUPPLIER_STATUSES,
    },
    { key: "code", label: "Code" },
  ],
};

export const purchaseOrdersList: ResourceConfig = {
  id: "purchase-orders",
  title: "Purchase orders",
  endpoint: "/admin/procurement/purchase-orders",
  responseKey: "purchase_orders",
  order: "-created_at",
  columns: [
    { key: "po_number", label: "PO number", kind: "code" },
    { key: "supplier_id", label: "Supplier", kind: "ref", ref: "supplier" },
    { key: "status", label: "Status", kind: "status" },
    { key: "currency_code", label: "Currency" },
    { key: "expected_at", label: "Expected", kind: "datetime" },
    { key: "created_at", label: "Created", kind: "datetime" },
  ],
  filters: [
    { key: "status", label: "Status", type: "select", options: PO_STATUSES },
    { key: "po_number", label: "PO number" },
    { key: "supplier_id", label: "Supplier id" },
  ],
};

export const poHeaderColumns: readonly ColumnConfig[] = [
  { key: "status", label: "Status", kind: "status" },
  { key: "supplier_id", label: "Supplier", kind: "ref", ref: "supplier" },
  { key: "currency_code", label: "Currency" },
  { key: "expected_at", label: "Expected", kind: "datetime" },
  { key: "created_by", label: "Created by" },
  { key: "approved_by", label: "Approved by" },
  { key: "approved_at", label: "Approved", kind: "datetime" },
  { key: "sent_at", label: "Sent", kind: "datetime" },
  { key: "closed_at", label: "Closed", kind: "datetime" },
  { key: "notes", label: "Notes" },
];

export const poLineColumns: readonly ColumnConfig[] = [
  { key: "line_no", label: "#", kind: "number" },
  { key: "material_id", label: "Material", kind: "ref", ref: "material" },
  { key: "uom", label: "UoM" },
  { key: "ordered_qty", label: "Ordered", kind: "number" },
  { key: "received_qty", label: "Received", kind: "number" },
  { key: "over_receipt_pct", label: "Over-receipt %", kind: "number" },
  { key: "unit_price", label: "Unit price", kind: "number" },
];

export const receiptColumns: readonly ColumnConfig[] = [
  { key: "receipt_no", label: "Receipt", kind: "code" },
  { key: "status", label: "Status", kind: "status" },
  { key: "location_id", label: "Location", kind: "ref", ref: "location" },
  { key: "delivery_note", label: "Delivery note" },
  { key: "received_by", label: "Received by" },
  { key: "received_at", label: "Received", kind: "datetime" },
];

export const supplierFields: readonly FieldConfig[] = [
  { name: "code", label: "Code", required: true },
  { name: "name", label: "Name", required: true },
  { name: "contact_name", label: "Contact name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "address", label: "Address", type: "textarea" },
  { name: "payment_terms", label: "Payment terms" },
  { name: "tax_code", label: "Tax code" },
  {
    name: "default_currency_code",
    label: "Currency (3 letters)",
    placeholder: "VND",
  },
  { name: "lead_time_days", label: "Lead time (days)", type: "integer" },
];

export const purchaseOrderFields: readonly FieldConfig[] = [
  {
    name: "supplier_id",
    label: "Supplier",
    type: "lookup",
    ref: "supplier",
    required: true,
  },
  { name: "currency_code", label: "Currency (3 letters)", placeholder: "VND" },
  { name: "expected_at", label: "Expected delivery", type: "datetime" },
  { name: "notes", label: "Notes", type: "textarea" },
  {
    name: "lines",
    label: "Line",
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
        name: "ordered_qty",
        label: "Ordered quantity",
        type: "number",
        required: true,
      },
      { name: "unit_price", label: "Unit price", type: "number" },
      {
        name: "over_receipt_pct",
        label: "Over-receipt tolerance %",
        type: "number",
      },
    ],
  },
];

const lineOption = (line: Row) => ({
  value: String(line.id),
  label: `#${String(line.line_no)} ${String(line.material_id)} (ordered ${String(line.ordered_qty)}, received ${String(line.received_qty)})`,
});

/** Goods receipt form; PO lines become the choices of each receipt line. */
export const goodsReceiptFields = (poLines: readonly Row[]): FieldConfig[] => [
  {
    name: "location_id",
    label: "Receiving location",
    type: "lookup",
    ref: "location",
    required: true,
  },
  { name: "delivery_note", label: "Delivery note" },
  {
    name: "lines",
    label: "Receipt line",
    type: "lines",
    required: true,
    fields: [
      {
        name: "purchase_order_line_id",
        label: "PO line",
        type: "select",
        required: true,
        options: poLines.map(lineOption),
      },
      { name: "qty", label: "Quantity", type: "number", required: true },
      {
        name: "bucket",
        label: "Stock bucket",
        type: "select",
        options: RECEIPT_BUCKETS,
        defaultValue: "GOOD",
        help: "QC_HOLD keeps the goods unavailable until QC releases them.",
      },
      { name: "lot_no", label: "Lot number", required: true },
      { name: "dye_lot_no", label: "Dye lot number" },
      {
        name: "rolls",
        label: "Roll",
        type: "lines",
        help: "Fabric only. Roll quantities must add up to the line quantity.",
        fields: [
          { name: "roll_code", label: "Roll code", required: true },
          {
            name: "qty",
            label: "Roll quantity",
            type: "number",
            required: true,
          },
          { name: "width_cm", label: "Width (cm)", type: "integer" },
        ],
      },
    ],
  },
];
