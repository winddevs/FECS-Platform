import { ProductDTO } from "@medusajs/framework/types";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { MEILISEARCH_MODULE } from "../../modules/meilisearch";
import MeilisearchModuleService from "../../modules/meilisearch/service";

export type SyncProductsStepInput = {
  products: ProductDTO[];
};

export const syncProductsStep = createStep(
  "sync-products",
  async ({ products }: SyncProductsStepInput, { container }) => {
    const searchService: MeilisearchModuleService =
      container.resolve(MEILISEARCH_MODULE);

    // Documents that already exist are restored if a later step fails.
    const existingProducts = await searchService.retrieveFromIndex(
      products.map((product) => product.id),
      "product"
    );
    const newProducts = products.filter(
      (product) => !existingProducts.some((p) => p.id === product.id)
    );
    await searchService.indexData(
      products as unknown as Record<string, unknown>[],
      "product"
    );

    return new StepResponse(undefined, {
      newProducts: newProducts.map((product) => product.id),
      existingProducts,
    });
  },
  async (input, { container }) => {
    if (!input) {
      return;
    }

    const searchService: MeilisearchModuleService =
      container.resolve(MEILISEARCH_MODULE);

    if (input.newProducts) {
      await searchService.deleteFromIndex(input.newProducts, "product");
    }

    if (input.existingProducts) {
      await searchService.indexData(input.existingProducts, "product");
    }
  }
);
