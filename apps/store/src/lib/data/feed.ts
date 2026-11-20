import { sdk } from "@lib/config";
import {
  buildGoogleFeedItems,
  renderGoogleFeed,
} from "@lib/feeds/google-merchant";
import { SITE_NAME, absoluteUrl } from "@lib/seo/site";
import { cacheLife, cacheTag } from "next/cache";

import type { StoreProductWithPayload } from "@/types/global";

import { PAGE_SIZE, collectPages } from "./paginate";
import { getRegion } from "./regions";

const FEED_FIELDS = [
  "*variants.calculated_price",
  "+variants.inventory_quantity",
  "*variants.options",
  "*options",
  "*categories",
  "*images",
  "+metadata",
  "*payload_product",
].join(",");

/**
 * Google Merchant Center feed (RSS 2.0) for one country, built from the live
 * Medusa catalogue and cached for an hour.
 *
 * Throws when the catalogue cannot be read or comes back empty. A thrown error
 * is not cached, and the route answers 503 so Merchant Center keeps the items
 * from the last good fetch instead of deleting them.
 */
export const getGoogleMerchantFeed = async (
  countryCode: string,
  locale: string
): Promise<string> => {
  "use cache";
  cacheTag("feed-google");
  cacheLife("hours");

  const region = await getRegion(countryCode);
  if (!region) {
    throw new Error(`No region serves country "${countryCode}"`);
  }

  const products = await collectPages(async (offset) => {
    const { products: items, count } = await sdk.client.fetch<{
      products: StoreProductWithPayload[];
      count: number;
    }>("/store/products", {
      query: {
        region_id: region.id,
        fields: FEED_FIELDS,
        limit: PAGE_SIZE,
        offset,
      },
    });
    return { items, count };
  });

  const baseUrl = absoluteUrl("/");
  const items = products.flatMap((product) =>
    buildGoogleFeedItems({ product, baseUrl, locale, countryCode })
  );
  if (items.length === 0) {
    throw new Error("The catalogue has no purchasable products with images");
  }

  return renderGoogleFeed({
    title: SITE_NAME,
    link: absoluteUrl(`/${locale}/${countryCode}`),
    description: `${SITE_NAME} product feed`,
    items,
  });
};
