import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { getMessageChannel } from "../integrations/channel/registry";
import type { EventEnvelope } from "../lib/events/envelope";
import { isEnabled } from "../lib/feature-flags";
import { socialLocale } from "../lib/inbox/handlers/meta";
import { notifyCustomer } from "../lib/social/notify";
import { toCustomerProductionStatus } from "../modules/manufacturing/lib/production-status";
import type { MoStatus } from "../modules/manufacturing/models/manufacturing-order";
import { SOCIAL_COMMERCE_MODULE } from "../modules/socialCommerce";
import {
  productionText,
  shipmentText,
} from "../modules/socialCommerce/lib/messages";
import type SocialCommerceModuleService from "../modules/socialCommerce/service";

const NOTIFY_SHIPMENT_STATES = new Set([
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
]);
const NOTIFY_PRODUCTION_STATES = new Set([
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "PREPARING_SHIPMENT",
  "READY_TO_SHIP",
]);

type Data = Record<string, any>;

/**
 * Domain events -> customer notifications (FR-NOT-001/004). The event bus is
 * at-least-once, so every notification carries a stable dedupe key.
 */
export default async function notifyCustomerEvents({
  event,
  container,
}: SubscriberArgs<EventEnvelope<Data>>): Promise<void> {
  if (
    !isEnabled("META_MESSENGER_ENABLED") ||
    !isEnabled("META_SHIPMENT_NOTIFICATION_ENABLED")
  ) {
    return;
  }
  const envelope = event.data;
  const data = envelope.data;
  const locale = socialLocale();
  let orderId: string | null = null;
  let dedupe = "";
  let text = "";

  switch (envelope.event_type) {
    case "fulfillment.shipment_status_changed.v1": {
      if (!NOTIFY_SHIPMENT_STATES.has(data.to) || data.return_id) return;
      orderId = data.order_id;
      dedupe = `shipment:${data.shipment_id}:${data.to}`;
      text = shipmentText(
        { tracking_number: data.tracking_number ?? null, status: data.to },
        locale
      );
      break;
    }
    case "manufacturing.mo_status_changed.v1": {
      if (!data.customer_order_id) return;
      const status = toCustomerProductionStatus(data.to as MoStatus, false);
      if (!status || !NOTIFY_PRODUCTION_STATES.has(status)) return;
      orderId = data.customer_order_id;
      dedupe = `mo:${data.mo_id}:${status}`;
      text = productionText(status, locale);
      break;
    }
    case "finished-goods.receipt_posted.v1": {
      if (!data.allocated_to_order_id) return;
      orderId = data.allocated_to_order_id;
      dedupe = `fg:${data.batch_id}:READY_TO_SHIP`;
      text = productionText("READY_TO_SHIP", locale);
      break;
    }
    default:
      return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "display_id"],
    filters: { id: orderId as string },
  });
  const customerId = orders[0]?.customer_id;
  if (!customerId) {
    return;
  }
  const prefix =
    locale === "vi"
      ? `Đơn #${orders[0].display_id}: `
      : `Order #${orders[0].display_id}: `;
  await notifyCustomer(
    {
      service: container.resolve<SocialCommerceModuleService>(
        SOCIAL_COMMERCE_MODULE
      ),
      channel: getMessageChannel(),
    },
    {
      customer_id: customerId,
      dedupe_key: dedupe,
      event_type: envelope.event_type,
      text: `${prefix}${text}`,
    }
  );
}

export const config: SubscriberConfig = {
  event: [
    "fulfillment.shipment_status_changed.v1",
    "manufacturing.mo_status_changed.v1",
    "finished-goods.receipt_posted.v1",
  ],
};
