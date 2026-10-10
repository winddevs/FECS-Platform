import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";

import { isEnabled } from "../lib/feature-flags";
import { onFulfillmentCreatedWorkflow } from "../workflows/fulfillment-created";

export default async function orderFulfillmentCreated({
  event,
  container,
}: SubscriberArgs<{
  order_id: string;
  fulfillment_id: string;
}>): Promise<void> {
  const ship = isEnabled("MANUFACTURING_ENABLED");
  const carrier =
    isEnabled("JT_FULFILLMENT_ENABLED") && isEnabled("JT_AUTO_CREATE_SHIPMENT");
  if (!ship && !carrier) {
    return;
  }
  await onFulfillmentCreatedWorkflow(container).run({
    input: {
      order_id: event.data.order_id,
      fulfillment_id: event.data.fulfillment_id,
      actor_id: "system:fulfillment-created",
      correlation_id: `ful_${event.data.fulfillment_id}`,
      ship_finished_goods: ship,
      create_carrier_shipment: carrier,
    },
  });
}

export const config: SubscriberConfig = {
  event: "order.fulfillment_created",
};
