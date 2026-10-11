import { Badge } from "@medusajs/ui";

type BadgeColor = "green" | "red" | "blue" | "orange" | "grey" | "purple";

const GROUPS: Record<Exclude<BadgeColor, "grey">, readonly string[]> = {
  green: [
    "ACTIVE",
    "APPROVED",
    "RECEIVED",
    "COMPLETED",
    "RELEASED",
    "DELIVERED",
    "POSTED",
    "SUCCEEDED",
    "OK",
    "RESOLVED",
    "READY",
    "INSPECTED",
    "SHIPPED",
    "MO_CREATED",
    "OPTED_IN",
    "PUBLISHED",
    "PROCESSED",
    "CUT",
    "A_GRADE",
    "AVAILABLE",
  ],
  red: [
    "FAILED",
    "FAILED_FINAL",
    "FAILED_RETRYABLE",
    "REJECTED",
    "CANCELLED",
    "BLOCKED",
    "DAMAGED",
    "SCRAP",
    "DELIVERY_FAILED",
    "EXCEPTION",
    "ERROR",
    "SHORTAGE",
    "RETURNED_TO_SENDER",
    "CARRIER_EXCEPTION",
    "STALE",
    "OPTED_OUT",
    "VOID",
  ],
  orange: [
    "PENDING",
    "PENDING_APPROVAL",
    "PENDING_INVENTORY",
    "ON_HOLD",
    "QC_HOLD",
    "WAITING_MATERIAL",
    "PARTIAL",
    "OPEN",
    "UNMAPPED",
    "UNKNOWN",
    "REQUESTED",
    "B_GRADE",
    "REWORK",
    "QC_PENDING",
    "HOLD",
    "RETURNING",
    "DEPLETED",
  ],
  blue: [
    "SENT",
    "IN_PROGRESS",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "PICKED_UP",
    "PICKUP_PENDING",
    "ARRIVED_HUB",
    "AUTHORIZED",
    "PLANNED",
    "MATERIAL_CHECK",
    "MATERIAL_RESERVED",
    "PACKING",
    "CREATED",
    "BOT",
    "ALLOCATED",
  ],
  purple: ["HUMAN"],
};

const COLOR_BY_STATUS = new Map<string, BadgeColor>();
for (const [color, statuses] of Object.entries(GROUPS)) {
  for (const status of statuses) {
    COLOR_BY_STATUS.set(status, color as BadgeColor);
  }
}

const PARTIAL_PREFIX = /^PARTIALLY_/;

/** Maps a status string (any module) to a badge color; unknown -> grey. */
export const statusColor = (status: string): BadgeColor => {
  const key = status.toUpperCase();
  if (PARTIAL_PREFIX.test(key)) {
    return "orange";
  }
  return COLOR_BY_STATUS.get(key) ?? "grey";
};

export const StatusBadge = ({
  status,
}: {
  status: string | null | undefined;
}) => {
  if (!status) {
    return <span aria-label="No status">-</span>;
  }
  return (
    <Badge color={statusColor(status)} size="2xsmall">
      {status.replace(/_/g, " ")}
    </Badge>
  );
};
