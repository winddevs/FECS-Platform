import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { getMessageChannel } from "../integrations/channel/registry";
import { isEnabled } from "../lib/feature-flags";
import { socialLocale } from "../lib/inbox/handlers/meta";
import { notifyCustomer } from "../lib/social/notify";
import { SOCIAL_COMMERCE_MODULE } from "../modules/socialCommerce";
import { orderConfirmedText } from "../modules/socialCommerce/lib/messages";
import type SocialCommerceModuleService from "../modules/socialCommerce/service";

/**
 * "Order confirmed" on Messenger (FR-NOT-004). The e-mail confirmation is sent
 * by order-placed.ts; this one reaches customers who linked their Messenger.
 * It is dropped silently for guests and for customers with no linked identity.
 */
export default async function notifyOrderConfirmed({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  if (
    !isEnabled("META_MESSENGER_ENABLED") ||
    !isEnabled("META_SHIPMENT_NOTIFICATION_ENABLED")
  ) {
    return;
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "display_id"],
    filters: { id: event.data.id },
  });
  const order = orders[0];
  if (!order?.customer_id) {
    return;
  }
  const locale = socialLocale();
  const prefix =
    locale === "vi"
      ? `Đơn #${order.display_id}: `
      : `Order #${order.display_id}: `;
  await notifyCustomer(
    {
      service: container.resolve<SocialCommerceModuleService>(
        SOCIAL_COMMERCE_MODULE
      ),
      channel: getMessageChannel(),
    },
    {
      customer_id: order.customer_id,
      dedupe_key: `order:${order.id}:CONFIRMED`,
      event_type: "order.placed",
      text: `${prefix}${orderConfirmedText(locale)}`,
    }
  );
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
