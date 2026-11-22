import { sdk } from "@lib/config";
import { cacheLife, cacheTag } from "next/cache";

import { PAGE_SIZE, collectPages } from "./paginate";

export type OutlineEntry = { handle: string; name: string };

type NamedRow = {
  handle?: string | null;
  name?: string | null;
  title?: string | null;
};

const toEntries = (rows: readonly NamedRow[]): OutlineEntry[] =>
  rows.flatMap((row) => {
    const name = row.name ?? row.title;
    return row.handle && name ? [{ handle: row.handle, name }] : [];
  });

/**
 * Category and collection names for the llms.txt guide. Throws when Medusa is
 * unreachable, so "use cache" never stores an empty outline.
 */
export const getCatalogOutline = async (): Promise<{
  categories: OutlineEntry[];
  collections: OutlineEntry[];
}> => {
  "use cache";
  cacheTag("catalog-outline");
  cacheLife("hours");

  const [categories, collections] = await Promise.all([
    collectPages(async (offset) => {
      const { product_categories: items, count } = await sdk.client.fetch<{
        product_categories: NamedRow[];
        count: number;
      }>("/store/product-categories", {
        query: { fields: "handle,name", limit: PAGE_SIZE, offset },
      });
      return { items, count };
    }),
    collectPages(async (offset) => {
      const { collections: items, count } = await sdk.client.fetch<{
        collections: NamedRow[];
        count: number;
      }>("/store/collections", {
        query: { fields: "handle,title", limit: PAGE_SIZE, offset },
      });
      return { items, count };
    }),
  ]);

  return {
    categories: toEntries(categories),
    collections: toEntries(collections),
  };
};
