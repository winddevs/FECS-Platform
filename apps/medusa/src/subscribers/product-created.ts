import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";

import { createPayloadProductsWorkflow } from "../workflows/create-payload-products";
import { syncProductsWorkflow } from "../workflows/sync-products";

export default async function productCreatedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger");

  try {
    logger.info(
      `Syncing newly created product ${event.data.id} to the search index...`
    );

    await createPayloadProductsWorkflow(container).run({
      input: {
        product_ids: [event.data.id],
      },
    });

    await syncProductsWorkflow(container).run({
      input: {
        filters: { id: event.data.id },
        limit: 1,
        offset: 0,
      },
    });

    logger.info(
      `Successfully synced product ${event.data.id} to the search index`
    );
  } catch (error) {
    logger.error(
      `Failed to sync product ${event.data.id} to the search index:`,
      error
    );
  }
}

export const config: SubscriberConfig = {
  event: "product.created",
};
