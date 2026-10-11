import { toNumber } from "../../lib/erp/format";
import type {
  ColumnConfig,
  ResourceConfig,
  Row,
} from "../../lib/erp/resource-types";

const MATERIAL_TYPES = ["FABRIC", "TRIM", "PACKAGING", "OTHER"] as const;
const LOCATION_KINDS = [
  "RAW_MATERIAL",
  "WIP",
  "QC_HOLD",
  "QUARANTINE",
  "IN_TRANSIT",
  "RETURN_QC",
] as const;
const ROLL_STATUSES = ["ACTIVE", "DEPLETED", "DAMAGED"] as const;
const MOVEMENT_TYPES = [
  "RECEIPT",
  "ISSUE_TO_PRODUCTION",
  "RETURN_FROM_PRODUCTION",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "SCRAP",
  "ADJUSTMENT_PLUS",
  "ADJUSTMENT_MINUS",
  "QC_RELEASE",
  "QC_REJECT",
] as const;

const BASE = "/admin/material-inventory";

/** available = on_hand - reserved - qc_hold - damaged (model contract). */
const availableOf = (row: Row): number | undefined => {
  const onHand = toNumber(row.on_hand_qty);
  if (onHand === undefined) {
    return undefined;
  }
  return (
    onHand -
    (toNumber(row.reserved_qty) ?? 0) -
    (toNumber(row.qc_hold_qty) ?? 0) -
    (toNumber(row.damaged_qty) ?? 0)
  );
};

export const balanceColumns: readonly ColumnConfig[] = [
  { key: "material_id", label: "Material", kind: "ref", ref: "material" },
  { key: "location_id", label: "Location", kind: "ref", ref: "location" },
  { key: "lot_id", label: "Lot id", kind: "code" },
  { key: "roll_id", label: "Roll id", kind: "code" },
  { key: "on_hand_qty", label: "On hand", kind: "number" },
  { key: "reserved_qty", label: "Reserved", kind: "number" },
  { key: "qc_hold_qty", label: "QC hold", kind: "number" },
  { key: "damaged_qty", label: "Damaged", kind: "number" },
  { key: "available", label: "Available", kind: "number", value: availableOf },
  { key: "version", label: "Version", kind: "number" },
];

export const materialsList: ResourceConfig = {
  id: "materials",
  title: "Materials",
  endpoint: `${BASE}/materials`,
  responseKey: "materials",
  columns: [
    { key: "code", label: "Code", kind: "code" },
    { key: "name", label: "Name" },
    { key: "material_type", label: "Type" },
    { key: "uom", label: "UoM" },
    { key: "track_lot", label: "Lot", kind: "boolean" },
    { key: "track_roll", label: "Roll", kind: "boolean" },
    { key: "track_dye_lot", label: "Dye lot", kind: "boolean" },
    { key: "allocation_policy", label: "Allocation" },
    { key: "is_active", label: "Active", kind: "boolean" },
  ],
  filters: [
    { key: "code", label: "Code" },
    {
      key: "material_type",
      label: "Type",
      type: "select",
      options: MATERIAL_TYPES,
    },
  ],
};

export const locationColumns: readonly ColumnConfig[] = [
  { key: "code", label: "Code", kind: "code" },
  { key: "name", label: "Name" },
  { key: "warehouse_code", label: "Warehouse" },
  { key: "kind", label: "Kind", kind: "status" },
  { key: "country_code", label: "Country" },
  { key: "is_active", label: "Active", kind: "boolean" },
];

export const locationsList: ResourceConfig = {
  id: "locations",
  title: "Locations",
  endpoint: `${BASE}/locations`,
  responseKey: "locations",
  columns: locationColumns,
  filters: [
    { key: "warehouse_code", label: "Warehouse" },
    { key: "kind", label: "Kind", type: "select", options: LOCATION_KINDS },
  ],
};

export const balancesList: ResourceConfig = {
  id: "balances",
  title: "Stock balances",
  description: "Click a balance to count, adjust, scrap, transfer or QC it.",
  endpoint: `${BASE}/balances`,
  responseKey: "balances",
  columns: balanceColumns,
  filters: [
    { key: "material_id", label: "Material id" },
    { key: "lot_id", label: "Lot id" },
    { key: "roll_id", label: "Roll id" },
    { key: "location_id", label: "Location id" },
  ],
};

export const lotsList: ResourceConfig = {
  id: "lots",
  title: "Lots",
  endpoint: `${BASE}/lots`,
  responseKey: "lots",
  columns: [
    { key: "lot_no", label: "Lot", kind: "code" },
    { key: "dye_lot_no", label: "Dye lot", kind: "code" },
    { key: "material_id", label: "Material", kind: "ref", ref: "material" },
    { key: "supplier_id", label: "Supplier", kind: "ref", ref: "supplier" },
    { key: "source_type", label: "Source" },
    { key: "source_id", label: "Source id", kind: "code" },
    { key: "received_at", label: "Received", kind: "datetime" },
  ],
  filters: [
    { key: "material_id", label: "Material id" },
    { key: "lot_no", label: "Lot no" },
    { key: "dye_lot_no", label: "Dye lot no" },
    { key: "source_type", label: "Source type" },
    { key: "source_id", label: "Source id" },
  ],
};

export const rollColumns: readonly ColumnConfig[] = [
  { key: "roll_code", label: "Roll code", kind: "code" },
  { key: "material_id", label: "Material", kind: "ref", ref: "material" },
  { key: "lot_id", label: "Lot id", kind: "code" },
  { key: "initial_qty", label: "Initial qty", kind: "number" },
  { key: "width_cm", label: "Width (cm)", kind: "number" },
  { key: "status", label: "Status", kind: "status" },
];

export const rollsList: ResourceConfig = {
  id: "rolls",
  title: "Rolls",
  endpoint: `${BASE}/rolls`,
  responseKey: "rolls",
  columns: rollColumns,
  filters: [
    { key: "roll_code", label: "Roll code" },
    { key: "material_id", label: "Material id" },
    { key: "lot_id", label: "Lot id" },
    { key: "status", label: "Status", type: "select", options: ROLL_STATUSES },
  ],
};

export const movementsList: ResourceConfig = {
  id: "movements",
  title: "Movements ledger",
  description: "Immutable stock ledger, newest first.",
  endpoint: `${BASE}/movements`,
  responseKey: "movements",
  order: "-created_at",
  columns: [
    { key: "occurred_at", label: "When", kind: "datetime" },
    { key: "movement_type", label: "Type", kind: "status" },
    { key: "material_id", label: "Material", kind: "ref", ref: "material" },
    { key: "location_id", label: "Location", kind: "ref", ref: "location" },
    { key: "qty", label: "Qty", kind: "number" },
    { key: "on_hand_delta", label: "On hand Δ", kind: "number" },
    { key: "qc_hold_delta", label: "QC hold Δ", kind: "number" },
    { key: "damaged_delta", label: "Damaged Δ", kind: "number" },
    { key: "reference_type", label: "Ref type" },
    { key: "reference_id", label: "Ref id", kind: "code" },
    { key: "reason", label: "Reason" },
    { key: "actor_id", label: "Actor", kind: "code" },
  ],
  filters: [
    {
      key: "movement_type",
      label: "Type",
      type: "select",
      options: MOVEMENT_TYPES,
    },
    { key: "material_id", label: "Material id" },
    { key: "balance_id", label: "Balance id" },
    { key: "roll_id", label: "Roll id" },
    { key: "reference_type", label: "Reference type" },
    { key: "reference_id", label: "Reference id" },
  ],
};
