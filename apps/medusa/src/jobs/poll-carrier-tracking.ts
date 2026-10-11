import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import {
  DEFAULT_CARRIER,
  getCarrierProvider,
} from "../integrations/carrier/registry";
import { isEnabled } from "../lib/feature-flags";
import { ingestCarrierEvents } from "../lib/fulfillment/ingest-tracking";
import { FASHION_FULFILLMENT_MODULE } from "../modules/fulfillment";
import type FulfillmentModuleService from "../modules/fulfillment/service";

const BATCH_SIZE = 50;
const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;

/**
 * Reconciliation poll (FR-FUL-006): webhooks are primary, polling repairs
 * missed pushes. Only shipments not polled recently are claimed, so several
 * workers never poll the same parcel twice.
 */
export default async function pollCarrierTracking(
  container: MedusaContainer
): Promise<void> {
  if (!isEnabled("JT_RECONCILIATION_ENABLED")) {
    return;
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const service = container.resolve<FulfillmentModuleService>(
    FASHION_FULFILLMENT_MODULE
  );
  const provider = getCarrierProvider(DEFAULT_CARRIER);

  const claimed = await service.claimShipmentsToPoll({
    carrier_code: provider.code,
    limit: BATCH_SIZE,
    stale_after_seconds: Number(
      process.env.TRACKING_POLL_STALE_SECONDS ?? DEFAULT_STALE_AFTER_SECONDS
    ),
  });
  for (const shipment of claimed) {
    try {
      const events = await provider.getTracking(shipment.tracking_number);
      await ingestCarrierEvents(service, provider, events, {
        actor_id: "system:tracking-poll",
      });
    } catch (error) {
      logger.warn(
        `[tracking-poll] ${shipment.tracking_number}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const config = {
  name: "poll-carrier-tracking",
  // Every minute; a parcel is only polled again once its last poll is stale.
  schedule: "* * * * *",
};
