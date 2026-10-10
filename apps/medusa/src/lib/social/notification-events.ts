import { toCustomerProductionStatus } from "../../modules/manufacturing/lib/production-status";
import type { MoStatus } from "../../modules/manufacturing/models/manufacturing-order";
import {
  type Locale,
  productionText,
  refundCompletedText,
  returnReceivedText,
  shipmentText,
} from "../../modules/socialCommerce/lib/messages";
import type { EventEnvelope } from "../events/envelope";

/**
 * Which domain events reach the customer, and with what text (FR-NOT-001/004).
 * Pure so the whole table can be tested without a bus. Returns null when the
 * event is not customer-facing.
 */
export type CustomerNotification = {
  order_id: string;
  dedupe_key: string;
  text: string;
};

export const NOTIFY_SHIPMENT_STATES = new Set([
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
]);
export const NOTIFY_PRODUCTION_STATES = new Set([
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "PREPARING_SHIPMENT",
  "READY_TO_SHIP",
]);

/** Event types the notification subscriber listens to. */
export const NOTIFYING_EVENTS = [
  "fulfillment.shipment_status_changed.v1",
  "manufacturing.mo_status_changed.v1",
  "finished-goods.receipt_posted.v1",
  "returns.return_received.v1",
  "returns.refund_completed.v1",
] as const;

type Data = Record<string, any>;

export const describeCustomerNotification = (
  envelope: Pick<EventEnvelope<Data>, "event_type" | "data">,
  locale: Locale
): CustomerNotification | null => {
  const data = envelope.data;
  switch (envelope.event_type) {
    case "fulfillment.shipment_status_changed.v1": {
      if (!NOTIFY_SHIPMENT_STATES.has(data.to) || data.return_id) {
        return null;
      }
      return {
        order_id: data.order_id,
        dedupe_key: `shipment:${data.shipment_id}:${data.to}`,
        text: shipmentText(
          { tracking_number: data.tracking_number ?? null, status: data.to },
          locale
        ),
      };
    }
    case "manufacturing.mo_status_changed.v1": {
      if (!data.customer_order_id) {
        return null;
      }
      const status = toCustomerProductionStatus(data.to as MoStatus, false);
      if (!status || !NOTIFY_PRODUCTION_STATES.has(status)) {
        return null;
      }
      return {
        order_id: data.customer_order_id,
        dedupe_key: `mo:${data.mo_id}:${status}`,
        text: productionText(status, locale),
      };
    }
    case "finished-goods.receipt_posted.v1": {
      if (!data.allocated_to_order_id) {
        return null;
      }
      return {
        order_id: data.allocated_to_order_id,
        dedupe_key: `fg:${data.batch_id}:READY_TO_SHIP`,
        text: productionText("READY_TO_SHIP", locale),
      };
    }
    case "returns.return_received.v1": {
      if (!data.order_id) {
        return null;
      }
      return {
        order_id: data.order_id,
        dedupe_key: `return:${data.return_id}:RECEIVED`,
        text: returnReceivedText(locale),
      };
    }
    case "returns.refund_completed.v1": {
      if (!data.order_id) {
        return null;
      }
      return {
        order_id: data.order_id,
        dedupe_key: `return:${data.return_id}:REFUNDED`,
        text: refundCompletedText(locale),
      };
    }
    default:
      return null;
  }
};
