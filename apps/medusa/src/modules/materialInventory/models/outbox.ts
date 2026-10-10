import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";

export const MATERIAL_OUTBOX_TABLE = "material_inventory_outbox_event";
export const MATERIAL_IDEMPOTENCY_TABLE =
  "material_inventory_idempotency_record";

export const MaterialInventoryOutboxEvent = defineOutboxEventModel(
  MATERIAL_OUTBOX_TABLE
);
export const MaterialInventoryIdempotencyRecord = defineIdempotencyRecordModel(
  MATERIAL_IDEMPOTENCY_TABLE
);
