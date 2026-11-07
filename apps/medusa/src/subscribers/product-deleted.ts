import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";

import { deletePayloadProductsWorkflow } from "../workflows/delete-payload-products";
import { deleteProductsFromMeilisearchWorkflow } from "../workflows/delete-products-from-meilisearch";

export default async function productDeletedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger");

  try {
    logger.info(`Deleting product ${event.data.id} from the search index...`);

    await deletePayloadProductsWorkflow(container).run({
      input: {
        product_ids: [event.data.id],
      },
    });

    await deleteProductsFromMeilisearchWorkflow(container).run({
      input: {
        ids: [event.data.id],
      },
    });

    logger.info(
      `Successfully deleted product ${event.data.id} from the search index`
    );
  } catch (error) {
    logger.error(
      `Failed to delete product ${event.data.id} from the search index:`,
      error
    );
  }
}

export const config: SubscriberConfig = {
  event: "product.deleted",
};
