import { listHandler } from "../../../fashion/list-handler";

/** Parcels that could not be delivered: the support work queue (FR-FUL-008). */
export const GET = listHandler("shipment_exception", "exceptions", [
  "order_id",
  "shipment_id",
  "type",
  "status",
] as const);
