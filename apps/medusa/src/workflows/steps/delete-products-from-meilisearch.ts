import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { MEILISEARCH_MODULE } from "../../modules/meilisearch";
import MeilisearchModuleService from "../../modules/meilisearch/service";

export type DeleteProductsFromMeilisearchWorkflow = {
  ids: string[];
};

export const deleteProductsFromMeilisearchStep = createStep(
  "delete-products-from-meilisearch-step",
  async ({ ids }: DeleteProductsFromMeilisearchWorkflow, { container }) => {
    const searchService: MeilisearchModuleService =
      container.resolve(MEILISEARCH_MODULE);

    const existingRecords = await searchService.retrieveFromIndex(
      ids,
      "product"
    );
    await searchService.deleteFromIndex(ids, "product");

    return new StepResponse(undefined, existingRecords);
  },
  async (existingRecords, { container }) => {
    if (!existingRecords) {
      return;
    }
    const searchService: MeilisearchModuleService =
      container.resolve(MEILISEARCH_MODULE);

    await searchService.indexData(existingRecords, "product");
  }
);
