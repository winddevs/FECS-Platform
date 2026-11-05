import { listCategories } from "@lib/data/categories";
import { listCollections } from "@lib/data/collections";
import { listProducts } from "@lib/data/products";
import { getRegion } from "@lib/data/regions";
import {
  getProductImages,
  getProductThumbnail,
} from "@lib/util/payload-images";
import { HttpTypes } from "@medusajs/types";
import { cache } from "react";

import type { StoreProductWithPayload } from "../../types/global";

const LATEST_LIMIT = 8;
const TAB_COLLECTION_LIMIT = 2;
const TILE_LIMIT = 4;

export type HomeTab = {
  id: string;
  /** Collection title, or `null` for the "new arrivals" tab. */
  title: string | null;
  products: StoreProductWithPayload[];
};

export type HomeTile = {
  id: string;
  title: string;
  href: string;
  image: string | null;
};

export type HomeData = {
  region: HttpTypes.StoreRegion;
  latest: StoreProductWithPayload[];
  tabs: HomeTab[];
  tiles: HomeTile[];
  /** Up to four product photos, used as hero / banner backdrops. */
  backdrops: (string | null)[];
};

/** Largest available photo of a product, or `null` when it has none. */
export const productPhoto = (product?: StoreProductWithPayload) => {
  if (!product) {
    return null;
  }
  return (
    getProductImages(product)[0]?.url ??
    getProductThumbnail(product)?.url ??
    null
  );
};

/** Store API filters that the SDK's `StoreProductParams` type leaves out. */
type ProductQuery = HttpTypes.FindParams &
  HttpTypes.StoreProductParams & {
    collection_id?: string[];
    category_id?: string[];
  };

const fetchProducts = async (
  countryCode: string,
  queryParams: ProductQuery
): Promise<StoreProductWithPayload[]> => {
  try {
    const { response } = await listProducts({ countryCode, queryParams });
    return response.products as StoreProductWithPayload[];
  } catch {
    return [];
  }
};

/**
 * Everything the home page needs, fetched once per request. Each part
 * degrades to an empty list, so a store with no collections or categories
 * still renders a complete page.
 */
export const getHomeData = cache(
  async (countryCode: string): Promise<HomeData | null> => {
    const region = await getRegion(countryCode);
    if (!region) {
      return null;
    }

    const [latest, collections, categories] = await Promise.all([
      fetchProducts(countryCode, {
        limit: LATEST_LIMIT,
        order: "-created_at",
      }),
      listCollections({ fields: "id,handle,title" })
        .then((result) => result.collections)
        .catch(() => [] as HttpTypes.StoreCollection[]),
      listCategories({ limit: 100 }).catch(
        () => [] as HttpTypes.StoreProductCategory[]
      ),
    ]);

    const tabCollections = collections.slice(0, TAB_COLLECTION_LIMIT);
    const tileCategories = categories
      .filter((category) => !category.parent_category)
      .slice(0, TILE_LIMIT);

    const [collectionProducts, tileProducts] = await Promise.all([
      Promise.all(
        tabCollections.map((collection) =>
          fetchProducts(countryCode, {
            collection_id: [collection.id],
            limit: LATEST_LIMIT,
          })
        )
      ),
      Promise.all(
        tileCategories.map((category) =>
          fetchProducts(countryCode, {
            category_id: [category.id],
            limit: 1,
          })
        )
      ),
    ]);

    const tabs: HomeTab[] = [{ id: "latest", title: null, products: latest }];
    for (const [index, collection] of tabCollections.entries()) {
      const products = collectionProducts[index] ?? [];
      if (products.length > 0) {
        tabs.push({ id: collection.id, title: collection.title, products });
      }
    }

    const tiles: HomeTile[] = tileCategories.map((category, index) => ({
      id: category.id,
      title: category.name,
      href: `/categories/${category.handle}`,
      image: productPhoto(tileProducts[index]?.[0]),
    }));

    return {
      region,
      latest,
      tabs,
      tiles,
      backdrops: [0, 1, 2, 3].map((index) => productPhoto(latest[index])),
    };
  }
);
