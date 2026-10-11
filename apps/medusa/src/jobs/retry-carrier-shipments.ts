import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import type { CreateShipmentRequest } from "../integrations/carrier/provider";
import { getCarrierProvider } from "../integrations/carrier/registry";
import { isEnabled } from "../lib/feature-flags";
import { createCarrierShipment } from "../lib/fulfillment/create-shipment";
import { FASHION_FULFILLMENT_MODULE } from "../modules/fulfillment";
import type FulfillmentModuleService from "../modules/fulfillment/service";

const BATCH_SIZE = 25;
const MIN_AGE_SECONDS = 60;

/**
 * Retries FAILED_RETRYABLE creations and resolves UNKNOWN/stuck ones through
 * the reconcile-first protocol, so an outage self-heals without duplicates
 * (NFR-AVL-001/004).
 */
export default async function retryCarrierShipments(
  container: MedusaContainer
): Promise<void> {
  if (!isEnabled("JT_FULFILLMENT_ENABLED")) {
    return;
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const service = container.resolve<FulfillmentModuleService>(
    FASHION_FULFILLMENT_MODULE
  );

  const stuck = await service.listStuckCreations({
    older_than_seconds: MIN_AGE_SECONDS,
    limit: BATCH_SIZE,
  });
  for (const row of stuck) {
    try {
      await createCarrierShipment(
        service,
        getCarrierProvider(row.carrier_code),
        {
          actor_id: "system:shipment-retry",
          order_id: row.order_id,
          medusa_fulfillment_id: row.medusa_fulfillment_id,
          return_id: row.return_id,
          exchange_return_id: row.exchange_return_id,
          request: row.request as unknown as CreateShipmentRequest,
        }
      );
    } catch (error) {
      logger.warn(
        `[shipment-retry] ${row.merchant_reference}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const config = {
  name: "retry-carrier-shipments",
  schedule: "* * * * *",
};
