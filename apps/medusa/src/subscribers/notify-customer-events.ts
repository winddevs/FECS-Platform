import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { getMessageChannel } from "../integrations/channel/registry";
import { readSetting } from "../lib/config/settings";
import type { EventEnvelope } from "../lib/events/envelope";
import { isEnabled } from "../lib/feature-flags";
import { socialLocale } from "../lib/inbox/handlers/meta";
import {
  describeCustomerNotification,
  NOTIFYING_EVENTS,
} from "../lib/social/notification-events";
import { notifyCustomer } from "../lib/social/notify";
import { SOCIAL_COMMERCE_MODULE } from "../modules/socialCommerce";
import type SocialCommerceModuleService from "../modules/socialCommerce/service";

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
  const locale = socialLocale();
  const notification = describeCustomerNotification(envelope, locale);
  if (!notification) {
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "display_id"],
    filters: { id: notification.order_id },
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
      maxPerHour: await readSetting(container, "social.notifications_per_hour"),
    },
    {
      customer_id: customerId,
      dedupe_key: notification.dedupe_key,
      category: notification.category,
      event_type: envelope.event_type,
      text: `${prefix}${notification.text}`,
    }
  );
}

export const config: SubscriberConfig = {
  event: [...NOTIFYING_EVENTS],
};
