import { toNumber } from "../../lib/erp/format";
import type {
  ColumnConfig,
  ResourceConfig,
  Row,
} from "../../lib/erp/resource-types";

const FGP = "/admin/finished-goods";
const FG_LOCATION_KINDS = [
  "FACTORY",
  "FULFILLMENT",
  "IN_TRANSIT",
  "RETURN_QC",
  "QUARANTINE",
  "SHOWROOM",
] as const;

/**
 * sellable = max(0, on_hand - warehouse_hold - qc_hold - allocated - safety_stock)
 * (same formula as the API's commerce projection, modules/finishedGoods/lib/projection.ts).
 */
export const sellableOf = (row: Row): number | undefined => {
  const onHand = toNumber(row.on_hand);
  if (onHand === undefined) {
    return undefined;
  }
  return Math.max(
    0,
    onHand -
      (toNumber(row.warehouse_hold) ?? 0) -
      (toNumber(row.qc_hold) ?? 0) -
      (toNumber(row.allocated) ?? 0) -
      (toNumber(row.safety_stock) ?? 0)
  );
};

export const balancesList: ResourceConfig = {
  id: "fg-balances",
  title: "Finished goods balances",
  description:
    "Sellable = on hand - holds - allocated - safety stock (never below 0).",
  endpoint: `${FGP}/balances`,
  responseKey: "balances",
  columns: [
    { key: "sku", label: "SKU", kind: "code" },
    { key: "location_id", label: "Location", kind: "ref", ref: "fgLocation" },
    { key: "on_hand", label: "On hand", kind: "number" },
    { key: "warehouse_hold", label: "Warehouse hold", kind: "number" },
    { key: "qc_hold", label: "QC hold", kind: "number" },
    { key: "allocated", label: "Allocated", kind: "number" },
    { key: "safety_stock", label: "Safety stock", kind: "number" },
    { key: "sellable", label: "Sellable", kind: "number", value: sellableOf },
    { key: "version", label: "Version", kind: "number" },
  ],
  filters: [
    { key: "sku", label: "SKU" },
    { key: "location_id", label: "Location id" },
  ],
};

export const batchesList: ResourceConfig = {
  id: "fg-batches",
  title: "Finished goods batches",
  description:
    "Click a batch to trace it back to its manufacturing order and forward to shipments.",
  endpoint: `${FGP}/batches`,
  responseKey: "batches",
  order: "-created_at",
  columns: [
    { key: "batch_no", label: "Batch", kind: "code" },
    { key: "sku", label: "SKU", kind: "code" },
    { key: "source", label: "Source" },
    { key: "location_id", label: "Location", kind: "ref", ref: "fgLocation" },
    { key: "qty", label: "Qty", kind: "number" },
    { key: "remaining_qty", label: "Remaining", kind: "number" },
    { key: "mo_id", label: "MO id", kind: "code" },
    { key: "produced_at", label: "Produced", kind: "datetime" },
  ],
  filters: [
    { key: "sku", label: "SKU" },
    { key: "mo_id", label: "MO id" },
    {
      key: "source",
      label: "Source",
      type: "select",
      options: ["PRODUCTION", "RETURN", "TRANSFER"],
    },
  ],
};

export const allocationsList: ResourceConfig = {
  id: "fg-allocations",
  title: "Allocations",
  endpoint: `${FGP}/allocations`,
  responseKey: "allocations",
  order: "-created_at",
  columns: [
    { key: "order_id", label: "Order", kind: "code" },
    { key: "sku", label: "SKU", kind: "code" },
    { key: "location_id", label: "Location", kind: "ref", ref: "fgLocation" },
    { key: "qty", label: "Qty", kind: "number" },
    { key: "shipped_qty", label: "Shipped", kind: "number" },
    { key: "status", label: "Status", kind: "status" },
    { key: "batch_id", label: "Batch id", kind: "code" },
  ],
  filters: [
    { key: "order_id", label: "Order id" },
    { key: "sku", label: "SKU" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["ALLOCATED", "SHIPPED", "RELEASED"],
    },
  ],
};

export const fgLocationsList: ResourceConfig = {
  id: "fg-locations",
  title: "Finished goods locations",
  endpoint: `${FGP}/locations`,
  responseKey: "locations",
  columns: [
    { key: "code", label: "Code", kind: "code" },
    { key: "name", label: "Name" },
    { key: "warehouse_code", label: "Warehouse" },
    { key: "kind", label: "Kind", kind: "status" },
    { key: "country_code", label: "Country" },
    {
      key: "is_commerce",
      label: "Sellable (feeds storefront)",
      kind: "boolean",
    },
    {
      key: "medusa_stock_location_id",
      label: "Medusa stock location",
      kind: "code",
    },
    { key: "is_active", label: "Active", kind: "boolean" },
  ],
  filters: [
    { key: "warehouse_code", label: "Warehouse" },
    { key: "kind", label: "Kind", type: "select", options: FG_LOCATION_KINDS },
  ],
};

export const fgTransfersList: ResourceConfig = {
  id: "fg-transfers",
  title: "Finished goods transfers",
  endpoint: `${FGP}/transfers`,
  responseKey: "transfers",
  order: "-created_at",
  columns: [
    { key: "transfer_no", label: "Transfer", kind: "code" },
    { key: "status", label: "Status", kind: "status" },
    { key: "sku", label: "SKU", kind: "code" },
    { key: "qty", label: "Qty", kind: "number" },
    { key: "from_location_id", label: "From", kind: "ref", ref: "fgLocation" },
    {
      key: "transit_location_id",
      label: "Via",
      kind: "ref",
      ref: "fgLocation",
    },
    { key: "to_location_id", label: "To", kind: "ref", ref: "fgLocation" },
    { key: "dispatched_at", label: "Dispatched", kind: "datetime" },
    { key: "closed_at", label: "Closed", kind: "datetime" },
    { key: "notes", label: "Notes" },
  ],
  filters: [
    { key: "sku", label: "SKU" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["IN_TRANSIT", "RECEIVED", "CANCELLED"],
    },
  ],
};

export const fgMovementsList: ResourceConfig = {
  id: "fg-movements",
  title: "Holds, adjustments and movements",
  description: "Physical finished-goods ledger, newest first.",
  endpoint: `${FGP}/movements`,
  responseKey: "movements",
  order: "-created_at",
  columns: [
    { key: "occurred_at", label: "When", kind: "datetime" },
    { key: "movement_type", label: "Type", kind: "status" },
    { key: "sku", label: "SKU", kind: "code" },
    { key: "location_id", label: "Location", kind: "ref", ref: "fgLocation" },
    { key: "qty", label: "Qty", kind: "number" },
    { key: "on_hand_delta", label: "On hand Δ", kind: "number" },
    { key: "warehouse_hold_delta", label: "Hold Δ", kind: "number" },
    { key: "qc_hold_delta", label: "QC hold Δ", kind: "number" },
    { key: "allocated_delta", label: "Allocated Δ", kind: "number" },
    { key: "reference_type", label: "Ref type" },
    { key: "reference_id", label: "Ref id", kind: "code" },
    { key: "reason", label: "Reason" },
    { key: "actor_id", label: "Actor", kind: "code" },
  ],
  filters: [
    { key: "sku", label: "SKU" },
    { key: "location_id", label: "Location id" },
    { key: "reference_id", label: "Reference id" },
  ],
};

export const traceBatchColumns: readonly ColumnConfig[] = [
  { key: "batch_no", label: "Batch", kind: "code" },
  { key: "sku", label: "SKU", kind: "code" },
  { key: "qty", label: "Qty", kind: "number" },
  { key: "source", label: "Source" },
  { key: "mo_id", label: "Manufacturing order id", kind: "code" },
  { key: "production_batch_id", label: "Production batch id", kind: "code" },
  { key: "packing_record_id", label: "Packing record id", kind: "code" },
  { key: "traceability", label: "Traceability", kind: "json" },
];

export const shipmentLineColumns: readonly ColumnConfig[] = [
  { key: "reference_type", label: "Ref type" },
  { key: "reference_id", label: "Ref id", kind: "code" },
  { key: "order_id", label: "Order", kind: "code" },
  { key: "sku", label: "SKU", kind: "code" },
  { key: "qty", label: "Qty", kind: "number" },
];
