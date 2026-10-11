import type {
  ColumnConfig,
  ResourceConfig,
} from "../../lib/erp/resource-types";

const MFG = "/admin/manufacturing";
const MO_TYPES = ["MTS", "MTO", "REPLENISHMENT", "SAMPLE", "REWORK"] as const;
const MO_STATUSES = [
  "DRAFT",
  "PLANNED",
  "MATERIAL_CHECK",
  "MATERIAL_RESERVED",
  "RELEASED",
  "IN_PROGRESS",
  "QC_PENDING",
  "PACKING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "ON_HOLD",
  "CANCELLED",
  "FAILED",
] as const;
const REQUEST_STATUSES = [
  "REQUESTED",
  "WAITING_MATERIAL",
  "MO_CREATED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;

export const manufacturingOrdersList: ResourceConfig = {
  id: "manufacturing-orders",
  title: "Manufacturing orders",
  endpoint: `${MFG}/mos`,
  responseKey: "manufacturing_orders",
  order: "-created_at",
  columns: [
    { key: "mo_number", label: "MO", kind: "code" },
    { key: "order_type", label: "Type" },
    { key: "status", label: "Status", kind: "status" },
    { key: "product_sku", label: "Product SKU", kind: "code" },
    { key: "planned_qty", label: "Planned", kind: "number" },
    { key: "completed_qty", label: "Completed", kind: "number" },
    { key: "material_status", label: "Material", kind: "status" },
    { key: "due_date", label: "Due", kind: "datetime" },
    { key: "customer_order_id", label: "Customer order", kind: "code" },
  ],
  filters: [
    { key: "status", label: "Status", type: "select", options: MO_STATUSES },
    { key: "order_type", label: "Type", type: "select", options: MO_TYPES },
    { key: "product_sku", label: "Product SKU" },
    { key: "customer_order_id", label: "Customer order id" },
  ],
};

export const manufacturingExceptionsList: ResourceConfig = {
  id: "manufacturing-exceptions",
  title: "Manufacturing exceptions",
  endpoint: `${MFG}/exceptions`,
  responseKey: "exceptions",
  order: "-created_at",
  defaultFilters: { status: "OPEN" },
  columns: [
    { key: "created_at", label: "Raised", kind: "datetime" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status", kind: "status" },
    { key: "mo_id", label: "MO id", kind: "code" },
    { key: "detail", label: "Detail", kind: "json" },
    { key: "resolved_by", label: "Resolved by", kind: "code" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["OPEN", "RESOLVED"],
    },
    { key: "type", label: "Type" },
    { key: "mo_id", label: "MO id" },
  ],
};

export const productionRequestsList: ResourceConfig = {
  id: "production-requests",
  title: "Production requests",
  description: "Make-to-order requests raised by paid customer orders.",
  endpoint: `${MFG}/production-requests`,
  responseKey: "production_requests",
  order: "-created_at",
  columns: [
    { key: "created_at", label: "Raised", kind: "datetime" },
    { key: "order_id", label: "Order", kind: "code" },
    { key: "sku", label: "SKU", kind: "code" },
    { key: "product_sku", label: "Product SKU", kind: "code" },
    { key: "qty", label: "Qty", kind: "number" },
    { key: "status", label: "Status", kind: "status" },
    { key: "mo_id", label: "MO id", kind: "code" },
    { key: "attempts", label: "Attempts", kind: "number" },
    { key: "last_error", label: "Last error" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: REQUEST_STATUSES,
    },
    { key: "order_id", label: "Order id" },
  ],
};

export const moHeaderColumns: readonly ColumnConfig[] = [
  { key: "status", label: "Status", kind: "status" },
  { key: "order_type", label: "Type" },
  { key: "product_sku", label: "Product SKU", kind: "code" },
  { key: "planned_qty", label: "Planned", kind: "number" },
  { key: "completed_qty", label: "Completed", kind: "number" },
  { key: "material_status", label: "Material", kind: "status" },
  { key: "bom_version", label: "Frozen BOM version", kind: "number" },
  { key: "bom_id", label: "BOM id", kind: "code" },
  { key: "routing_version", label: "Frozen routing version", kind: "number" },
  { key: "routing_id", label: "Routing id", kind: "code" },
  { key: "due_date", label: "Due", kind: "datetime" },
  { key: "customer_order_id", label: "Customer order", kind: "code" },
  { key: "source_mo_id", label: "Source MO", kind: "code" },
  { key: "held_from_status", label: "Held from" },
  { key: "short_closed", label: "Short-closed", kind: "boolean" },
  { key: "short_close_reason", label: "Short-close reason" },
  { key: "notes", label: "Notes" },
];

export const requirementColumns: readonly ColumnConfig[] = [
  { key: "material_id", label: "Material", kind: "ref", ref: "material" },
  { key: "uom", label: "UoM" },
  { key: "required_qty", label: "Required", kind: "number" },
  { key: "reserved_qty", label: "Reserved", kind: "number" },
  { key: "issued_qty", label: "Issued", kind: "number" },
  { key: "availability_status", label: "Availability", kind: "status" },
];

export const batchColumns: readonly ColumnConfig[] = [
  { key: "batch_no", label: "Batch", kind: "code" },
  { key: "planned_qty", label: "Planned", kind: "number" },
  { key: "status", label: "Status", kind: "status" },
];

export const bundleColumns: readonly ColumnConfig[] = [
  { key: "bundle_code", label: "Bundle", kind: "code" },
  { key: "sku", label: "SKU", kind: "code" },
  { key: "qty", label: "Qty", kind: "number" },
  { key: "current_seq", label: "At op", kind: "number" },
  { key: "waiting_qty", label: "Waiting", kind: "number" },
  { key: "rework_qty", label: "Rework", kind: "number" },
  { key: "reject_qty", label: "Reject", kind: "number" },
  { key: "qc_released_qty", label: "QC released", kind: "number" },
  { key: "packed_qty", label: "Packed", kind: "number" },
];

export const reservedRollColumns: readonly ColumnConfig[] = [
  { key: "material_id", label: "Material", kind: "ref", ref: "material" },
  { key: "roll_code", label: "Roll", kind: "code" },
  { key: "assigned", label: "Assigned", kind: "number" },
  { key: "roll_qty", label: "Roll quantity", kind: "number" },
];
