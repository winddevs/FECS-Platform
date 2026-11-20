import type { MetadataRoute } from "next";

export type SitemapDoc = {
  /** URL segment, such as a product handle or a CMS slug. */
  handle: string;
  /** ISO date of the last change, when known. */
  updatedAt?: string | null;
};

export type SitemapSource = {
  /** Public site origin, for example `https://bibaestudios.com`. */
  baseUrl: string;
  locales: readonly string[];
  defaultLocale: string;
  countryCodes: readonly string[];
  products: readonly SitemapDoc[];
  categories: readonly SitemapDoc[];
  collections: readonly SitemapDoc[];
  pages: readonly SitemapDoc[];
  posts: readonly SitemapDoc[];
};

type SitemapPath = { path: string; updatedAt?: string | null };

const toDate = (value: string | null | undefined): Date | undefined => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const pathsFor = (prefix: string, docs: readonly SitemapDoc[]): SitemapPath[] =>
  docs
    .filter((doc) => doc.handle)
    .map((doc) => ({
      path: `${prefix}/${doc.handle}`,
      updatedAt: doc.updatedAt,
    }));

/**
 * One sitemap entry per page, locale and country. Every entry lists its other
 * language versions (hreflang), the same set the page puts in its own <head>.
 */
export const buildSitemapEntries = (
  source: SitemapSource
): MetadataRoute.Sitemap => {
  const entries: MetadataRoute.Sitemap = [];

  for (const countryCode of source.countryCodes) {
    const paths: SitemapPath[] = [
      { path: "" },
      { path: "/store" },
      { path: "/posts" },
      ...pathsFor("/products", source.products),
      ...pathsFor("/categories", source.categories),
      ...pathsFor("/collections", source.collections),
      ...pathsFor("", source.pages),
      ...pathsFor("/posts", source.posts),
    ];

    for (const { path, updatedAt } of paths) {
      const urlFor = (locale: string) =>
        new URL(`/${locale}/${countryCode}${path}`, source.baseUrl).href;
      const languages: Record<string, string> = {
        ...Object.fromEntries(
          source.locales.map((locale) => [locale, urlFor(locale)])
        ),
        "x-default": urlFor(source.defaultLocale),
      };

      for (const locale of source.locales) {
        entries.push({
          url: urlFor(locale),
          lastModified: toDate(updatedAt),
          alternates: { languages },
        });
      }
    }
  }

  return entries;
};
