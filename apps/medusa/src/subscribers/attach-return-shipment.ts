import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";

import type { EventEnvelope } from "../lib/events/envelope";
import { withCausation } from "../lib/observability/causation";
import { RETURNS_MODULE } from "../modules/returns";
import type ReturnsModuleService from "../modules/returns/service";

type ShipmentCreated = {
  shipment_id: string;
  return_id: string | null;
};

/**
 * A return shipment can be created later than the authorize call (carrier
 * outage, UNKNOWN outcome resolved by the retry job). When it finally exists,
 * link it to its RMA so the return moves to IN_TRANSIT.
 */
export default async function attachReturnShipment({
  event,
  container,
}: SubscriberArgs<EventEnvelope<ShipmentCreated>>): Promise<void> {
  const { shipment_id, return_id } = event.data.data;
  if (!return_id) {
    return;
  }
  await withCausation(event.data.event_id, () =>
    container
      .resolve<ReturnsModuleService>(RETURNS_MODULE)
      .attachReturnShipment({
        actor_id: "system:return-shipment",
        correlation_id: event.data.correlation_id ?? null,
        return_id,
        shipment_id,
      })
  );
}

export const config: SubscriberConfig = {
  event: "fulfillment.shipment_created.v1",
};
