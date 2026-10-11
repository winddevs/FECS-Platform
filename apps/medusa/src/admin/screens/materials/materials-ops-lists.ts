import type { ResourceConfig } from "../../lib/erp/resource-types";

const BASE = "/admin/material-inventory";
const RESERVATION_STATUSES = [
  "ACTIVE",
  "PARTIALLY_ISSUED",
  "ISSUED",
  "RELEASED",
] as const;
const TRANSFER_STATUSES = ["IN_TRANSIT", "RECEIVED", "CANCELLED"] as const;
const CYCLE_COUNT_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "NO_DIFFERENCE",
  "STALE",
] as const;

export const reservationsList: ResourceConfig = {
  id: "reservations",
  title: "Reservations",
  endpoint: `${BASE}/reservations`,
  responseKey: "reservations",
  order: "-created_at",
  columns: [
    { key: "reservation_no", label: "Reservation", kind: "code" },
    { key: "material_id", label: "Material", kind: "ref", ref: "material" },
    { key: "reference_type", label: "Ref type" },
    { key: "reference_id", label: "Ref id", kind: "code" },
    { key: "requested_qty", label: "Requested", kind: "number" },
    { key: "issued_qty", label: "Issued", kind: "number" },
    { key: "released_qty", label: "Released", kind: "number" },
    { key: "status", label: "Status", kind: "status" },
    { key: "dye_lot_count", label: "Dye lots", kind: "number" },
    { key: "planner_approved", label: "Planner OK", kind: "boolean" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: RESERVATION_STATUSES,
    },
    { key: "material_id", label: "Material id" },
    { key: "reference_type", label: "Reference type" },
    { key: "reference_id", label: "Reference id" },
  ],
};

export const cycleCountsList: ResourceConfig = {
  id: "cycle-counts",
  title: "Cycle counts",
  description: "Counts wait for a second person to approve the adjustment.",
  endpoint: `${BASE}/cycle-counts`,
  responseKey: "cycle_counts",
  order: "-created_at",
  defaultFilters: { status: "PENDING_APPROVAL" },
  columns: [
    { key: "created_at", label: "Counted", kind: "datetime" },
    { key: "material_id", label: "Material", kind: "ref", ref: "material" },
    { key: "balance_id", label: "Balance id", kind: "code" },
    { key: "expected_on_hand", label: "Expected", kind: "number" },
    { key: "counted_qty", label: "Counted", kind: "number" },
    { key: "diff_qty", label: "Difference", kind: "number" },
    { key: "status", label: "Status", kind: "status" },
    { key: "reason", label: "Reason" },
    { key: "counted_by", label: "Counted by", kind: "code" },
    { key: "decided_by", label: "Decided by", kind: "code" },
    { key: "decision_reason", label: "Decision note" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: CYCLE_COUNT_STATUSES,
    },
    { key: "material_id", label: "Material id" },
    { key: "balance_id", label: "Balance id" },
  ],
};

export const transfersList: ResourceConfig = {
  id: "transfers",
  title: "Transfers",
  endpoint: `${BASE}/transfers`,
  responseKey: "transfers",
  order: "-created_at",
  columns: [
    { key: "transfer_no", label: "Transfer", kind: "code" },
    { key: "status", label: "Status", kind: "status" },
    { key: "material_id", label: "Material", kind: "ref", ref: "material" },
    { key: "qty", label: "Qty", kind: "number" },
    { key: "from_location_id", label: "From", kind: "ref", ref: "location" },
    { key: "transit_location_id", label: "Via", kind: "ref", ref: "location" },
    { key: "to_location_id", label: "To", kind: "ref", ref: "location" },
    { key: "dispatched_at", label: "Dispatched", kind: "datetime" },
    { key: "closed_at", label: "Closed", kind: "datetime" },
    { key: "notes", label: "Notes" },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: TRANSFER_STATUSES,
    },
    { key: "material_id", label: "Material id" },
    { key: "to_location_id", label: "To location id" },
  ],
};
