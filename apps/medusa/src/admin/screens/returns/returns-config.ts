import type { FieldConfig } from "../../lib/erp/form-fields";
import type {
  ColumnConfig,
  ResourceConfig,
} from "../../lib/erp/resource-types";

const RETURN_STATUSES = [
  "REQUESTED",
  "AUTHORIZED",
  "REJECTED",
  "IN_TRANSIT",
  "RECEIVED",
  "INSPECTED",
  "CLOSED",
  "CANCELLED",
] as const;

export const returnsList: ResourceConfig = {
  id: "returns",
  title: "Returns",
  endpoint: "/admin/returns",
  responseKey: "returns",
  order: "-created_at",
  columns: [
    { key: "rma_no", label: "RMA", kind: "code" },
    { key: "created_at", label: "Requested", kind: "datetime" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status", kind: "status" },
    { key: "order_id", label: "Order", kind: "code" },
    { key: "reason", label: "Reason" },
    { key: "refund_status", label: "Refund", kind: "status" },
    { key: "exchange_sku", label: "Exchange SKU", kind: "code" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: RETURN_STATUSES,
    },
    { key: "order_id", label: "Order id" },
  ],
};

export const returnHeaderColumns: readonly ColumnConfig[] = [
  { key: "status", label: "Status", kind: "status" },
  { key: "type", label: "Type" },
  { key: "order_id", label: "Order", kind: "code" },
  { key: "customer_id", label: "Customer", kind: "code" },
  { key: "reason", label: "Reason" },
  { key: "eligibility", label: "Eligibility check", kind: "json" },
  { key: "authorized_by", label: "Authorized by", kind: "code" },
  { key: "return_shipment_id", label: "Return shipment", kind: "code" },
  { key: "exchange_sku", label: "Exchange SKU", kind: "code" },
  {
    key: "replacement_shipment_id",
    label: "Replacement shipment",
    kind: "code",
  },
  {
    key: "replacement_shipped_at",
    label: "Replacement shipped",
    kind: "datetime",
  },
  { key: "refund_status", label: "Refund status", kind: "status" },
  { key: "refund_payment_id", label: "Refund payment", kind: "code" },
  { key: "refund_amount", label: "Refund amount", kind: "number" },
  { key: "created_by", label: "Created by", kind: "code" },
];

export const returnItemColumns: readonly ColumnConfig[] = [
  { key: "sku", label: "SKU", kind: "code" },
  { key: "qty", label: "Qty", kind: "number" },
  { key: "order_line_id", label: "Order line", kind: "code" },
  { key: "disposition", label: "Disposition", kind: "status" },
  {
    key: "destination_location_id",
    label: "Destination",
    kind: "ref",
    ref: "fgLocation",
  },
  { key: "stock_posted", label: "Stock posted", kind: "boolean" },
  { key: "inspected_by", label: "Inspected by", kind: "code" },
  { key: "inspected_at", label: "Inspected", kind: "datetime" },
  { key: "inspection_notes", label: "Notes" },
];

export const authorizeFields: readonly FieldConfig[] = [
  {
    name: "override_reason",
    label: "Override reason",
    type: "textarea",
    help: "Required only when the return is not eligible. The override is audited.",
  },
  {
    name: "pickup_address",
    label: "Pickup address",
    type: "group",
    help: "Fill in to have the carrier collect the parcel; leave empty otherwise.",
    fields: [
      { name: "name", label: "Contact name", required: true },
      { name: "phone", label: "Phone", required: true },
      {
        name: "address_line",
        label: "Address",
        type: "textarea",
        required: true,
      },
      { name: "district", label: "District" },
      { name: "province", label: "Province" },
    ],
  },
  {
    name: "exchange_location_id",
    label: "Exchange stock location",
    type: "lookup",
    ref: "fgLocation",
    help: "Exchanges only: where the replacement is picked from.",
  },
];

export const rejectFields: readonly FieldConfig[] = [
  { name: "reason", label: "Reason", type: "textarea", required: true },
];

export const inspectFields: readonly FieldConfig[] = [
  {
    name: "disposition",
    label: "Disposition",
    type: "select",
    required: true,
    options: ["A_GRADE", "B_GRADE", "REWORK", "DAMAGED", "SCRAP"],
    help: "A_GRADE returns to a sellable location. B_GRADE, REWORK and DAMAGED must go to a non-sellable one. SCRAP needs no location.",
  },
  {
    name: "destination_location_id",
    label: "Destination location",
    type: "lookup",
    ref: "fgLocation",
  },
  { name: "notes", label: "Notes", type: "textarea" },
];

export const refundFields: readonly FieldConfig[] = [
  { name: "payment_id", label: "Payment id", required: true },
  { name: "amount", label: "Refund amount", type: "number", required: true },
  { name: "note", label: "Note", type: "textarea" },
];

export const requestReturnFields: readonly FieldConfig[] = [
  { name: "order_id", label: "Order id", required: true },
  {
    name: "type",
    label: "Type",
    type: "select",
    options: ["RETURN", "EXCHANGE"],
    defaultValue: "RETURN",
  },
  { name: "reason", label: "Reason", type: "textarea", required: true },
  { name: "exchange_sku", label: "Exchange SKU (exchanges only)" },
  { name: "customer_id", label: "Customer id" },
  {
    name: "items",
    label: "Item",
    type: "lines",
    required: true,
    fields: [
      { name: "order_line_id", label: "Order line id", required: true },
      { name: "sku", label: "SKU", required: true },
      { name: "qty", label: "Quantity", type: "integer", required: true },
    ],
  },
];
