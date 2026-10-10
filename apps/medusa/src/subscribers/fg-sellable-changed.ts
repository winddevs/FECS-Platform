import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";

import type { EventEnvelope } from "../lib/events/envelope";
import type { ProjectionEvent } from "../modules/finishedGoods/service";
import { syncSellableToMedusaWorkflow } from "../workflows/finished-goods";

/**
 * Applies the versioned sellable projection to Medusa inventory. Duplicates
 * and out-of-order deliveries are harmless: the version guard drops them.
 */
export default async function fgSellableChanged({
  event,
  container,
}: SubscriberArgs<EventEnvelope<ProjectionEvent>>): Promise<void> {
  await syncSellableToMedusaWorkflow(container).run({
    input: event.data.data,
  });
}

export const config: SubscriberConfig = {
  event: "finished-goods.sellable_changed.v1",
};
