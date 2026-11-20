import {
  listSitemapCategories,
  listSitemapCollections,
  listSitemapCountryCodes,
  listSitemapPages,
  listSitemapPosts,
  listSitemapProducts,
} from "@lib/data/sitemap";
import { absoluteUrl } from "@lib/seo/site";
import { buildSitemapEntries } from "@lib/seo/sitemap";
import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { DEFAULT_LOCALE } from "@/i18n/localization";
import { routing } from "@/i18n/routing";

const DEFAULT_COUNTRY_CODE = process.env.NEXT_PUBLIC_DEFAULT_REGION || "vn";

/**
 * Runs one data source. A failure drops that source from the sitemap and is
 * logged, so one unreachable backend does not hide the rest of the site.
 */
const settle = async <T>(
  label: string,
  load: () => Promise<T[]>
): Promise<T[]> => {
  try {
    return await load();
  } catch (error) {
    console.error(
      `Sitemap: could not load ${label}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return [];
  }
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Render per request, not at build time: the build may run without the
  // Medusa API, and an empty sitemap must never be baked into the image.
  await connection();

  const [regionCountryCodes, products, categories, collections, pages, posts] =
    await Promise.all([
      settle("regions", listSitemapCountryCodes),
      settle("products", listSitemapProducts),
      settle("categories", listSitemapCategories),
      settle("collections", listSitemapCollections),
      settle("pages", listSitemapPages),
      settle("posts", listSitemapPosts),
    ]);

  // Same fallback the proxy uses when the regions API is unreachable.
  const countryCodes =
    regionCountryCodes.length > 0 ? regionCountryCodes : [DEFAULT_COUNTRY_CODE];

  return buildSitemapEntries({
    baseUrl: absoluteUrl("/"),
    locales: routing.locales,
    defaultLocale: DEFAULT_LOCALE,
    countryCodes,
    products,
    categories,
    collections,
    pages,
    posts,
  });
}
