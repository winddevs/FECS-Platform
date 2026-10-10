import { defineIdempotencyRecordModel } from "../../../lib/idempotency/model";
import { defineOutboxEventModel } from "../../../lib/outbox/model";

export const PROCUREMENT_OUTBOX_TABLE = "procurement_outbox_event";
export const PROCUREMENT_IDEMPOTENCY_TABLE = "procurement_idempotency_record";

export const ProcurementOutboxEvent = defineOutboxEventModel(
  PROCUREMENT_OUTBOX_TABLE
);
export const ProcurementIdempotencyRecord = defineIdempotencyRecordModel(
  PROCUREMENT_IDEMPOTENCY_TABLE
);
