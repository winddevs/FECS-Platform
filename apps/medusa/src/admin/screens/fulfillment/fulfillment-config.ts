import type { FieldConfig } from "../../lib/erp/form-fields";
import type {
  ColumnConfig,
  ResourceConfig,
} from "../../lib/erp/resource-types";

const SHIPMENT_STATUSES = [
  "CREATED",
  "PICKUP_PENDING",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNING",
  "RETURNED",
  "CANCELLED",
  "EXCEPTION",
] as const;
const CREATE_STATES = [
  "PENDING",
  "SUCCEEDED",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
  "UNKNOWN",
] as const;
const EXCEPTION_TYPES = [
  "DELIVERY_FAILED",
  "RETURNED_TO_SENDER",
  "CARRIER_EXCEPTION",
] as const;

export const shipmentsList: ResourceConfig = {
  id: "shipments",
  title: "Shipments",
  endpoint: "/admin/fulfillment/shipments",
  responseKey: "shipments",
  order: "-created_at",
  columns: [
    { key: "created_at", label: "Created", kind: "datetime" },
    { key: "order_id", label: "Order", kind: "code" },
    { key: "carrier_code", label: "Carrier" },
    { key: "tracking_number", label: "Tracking", kind: "code" },
    { key: "status", label: "Status", kind: "status" },
    { key: "create_state", label: "Carrier booking", kind: "status" },
    { key: "last_event_at", label: "Last event", kind: "datetime" },
    { key: "delivered_at", label: "Delivered", kind: "datetime" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: SHIPMENT_STATUSES,
    },
    {
      key: "create_state",
      label: "Carrier booking",
      type: "select",
      options: CREATE_STATES,
    },
    { key: "carrier_code", label: "Carrier" },
    { key: "order_id", label: "Order id" },
  ],
};

export const exceptionsList: ResourceConfig = {
  id: "delivery-exceptions",
  title: "Delivery exceptions",
  description: "Failed or returned deliveries waiting for a decision.",
  endpoint: "/admin/fulfillment/exceptions",
  responseKey: "exceptions",
  order: "-created_at",
  defaultFilters: { status: "OPEN" },
  columns: [
    { key: "created_at", label: "Raised", kind: "datetime" },
    { key: "type", label: "Type", kind: "status" },
    { key: "status", label: "Status", kind: "status" },
    { key: "order_id", label: "Order", kind: "code" },
    { key: "shipment_id", label: "Shipment id", kind: "code" },
    { key: "detail", label: "Detail", kind: "json" },
    { key: "resolution", label: "Resolution", kind: "status" },
    { key: "resolution_note", label: "Note" },
    { key: "resolved_by", label: "Resolved by", kind: "code" },
    { key: "resolved_at", label: "Resolved", kind: "datetime" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["OPEN", "RESOLVED"],
    },
    { key: "type", label: "Type", type: "select", options: EXCEPTION_TYPES },
    { key: "order_id", label: "Order id" },
    { key: "shipment_id", label: "Shipment id" },
  ],
};

export const shipmentHeaderColumns: readonly ColumnConfig[] = [
  { key: "status", label: "Status", kind: "status" },
  { key: "create_state", label: "Carrier booking", kind: "status" },
  { key: "carrier_code", label: "Carrier" },
  { key: "tracking_number", label: "Tracking", kind: "code" },
  { key: "order_id", label: "Order", kind: "code" },
  { key: "merchant_reference", label: "Merchant reference", kind: "code" },
  { key: "carrier_order_id", label: "Carrier order id", kind: "code" },
  { key: "medusa_fulfillment_id", label: "Fulfillment id", kind: "code" },
  { key: "return_id", label: "Return id", kind: "code" },
  { key: "exchange_return_id", label: "Exchange return id", kind: "code" },
  { key: "attempts", label: "Booking attempts", kind: "number" },
  { key: "last_error", label: "Last error" },
  { key: "last_event_at", label: "Last event", kind: "datetime" },
  { key: "last_polled_at", label: "Last polled", kind: "datetime" },
  { key: "delivered_at", label: "Delivered", kind: "datetime" },
  { key: "superseded_at", label: "Superseded", kind: "datetime" },
  { key: "superseded_by_id", label: "Replaced by", kind: "code" },
];

export const trackingEventColumns: readonly ColumnConfig[] = [
  { key: "occurred_at", label: "When", kind: "datetime" },
  { key: "carrier_status", label: "Carrier status" },
  { key: "canonical_status", label: "Status", kind: "status" },
];

export const replaceFields: readonly FieldConfig[] = [
  { name: "reason", label: "Reason", type: "textarea", required: true },
];

export const resolveFields: readonly FieldConfig[] = [
  {
    name: "resolution",
    label: "Resolution",
    type: "select",
    required: true,
    options: ["REDELIVER", "REFUND", "RESTOCK", "CLOSE"],
  },
  { name: "note", label: "Note", type: "textarea", required: true },
];

export const createShipmentFields: readonly FieldConfig[] = [
  { name: "order_id", label: "Order id", required: true },
  { name: "fulfillment_id", label: "Fulfillment id", required: true },
];
