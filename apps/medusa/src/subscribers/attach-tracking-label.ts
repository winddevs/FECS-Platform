import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";

import type { EventEnvelope } from "../lib/events/envelope";
import { attachTrackingLabel } from "../lib/fulfillment/tracking-label";

type ShipmentCreated = {
  shipment_id: string;
  medusa_fulfillment_id: string | null;
  tracking_number: string | null;
};

/**
 * Copies the carrier tracking number onto the Medusa fulfillment (FR-FUL-004).
 * Best effort: the shipment itself is already stored in our own module, so a
 * failure here is logged and never blocks fulfilment.
 */
export default async function attachTrackingLabelSubscriber({
  event,
  container,
}: SubscriberArgs<EventEnvelope<ShipmentCreated>>): Promise<void> {
  const { medusa_fulfillment_id, tracking_number } = event.data.data;
  if (!medusa_fulfillment_id || !tracking_number) {
    return;
  }
  try {
    await attachTrackingLabel(
      container,
      medusa_fulfillment_id,
      tracking_number
    );
  } catch (error) {
    container
      .resolve<{ warn: (message: string) => void }>("logger")
      .warn(
        `[tracking-label] ${medusa_fulfillment_id}: ${error instanceof Error ? error.message : String(error)}`
      );
  }
}

export const config: SubscriberConfig = {
  event: "fulfillment.shipment_created.v1",
};
