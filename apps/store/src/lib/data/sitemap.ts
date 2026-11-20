import { sdk } from "@lib/config";
import type { SitemapDoc } from "@lib/seo/sitemap";
import config from "@payload-config";
import { cacheLife, cacheTag } from "next/cache";
import { getPayload } from "payload";

import { PAGE_SIZE, collectPages } from "./paginate";
import { listRegions } from "./regions";

const SITEMAP_FIELDS = "handle,updated_at";

type MedusaHandle = { handle?: string | null; updated_at?: string | null };
type MedusaPage = { items: MedusaHandle[]; count: number };

const toDocs = (items: readonly MedusaHandle[]): SitemapDoc[] =>
  items.flatMap((item) =>
    item.handle ? [{ handle: item.handle, updatedAt: item.updated_at }] : []
  );

const fetchAllDocs = async (
  fetchPage: (offset: number) => Promise<MedusaPage>
): Promise<SitemapDoc[]> => toDocs(await collectPages(fetchPage));

const query = (offset: number) => ({
  fields: SITEMAP_FIELDS,
  limit: PAGE_SIZE,
  offset,
});

// The functions below throw when their source is unreachable. A thrown error
// is not stored by "use cache", so an outage never freezes an empty list.

export const listSitemapProducts = async (): Promise<SitemapDoc[]> => {
  "use cache";
  cacheTag("sitemap-products");
  cacheLife("hours");

  return fetchAllDocs(async (offset) => {
    const { products, count } = await sdk.client.fetch<{
      products: MedusaHandle[];
      count: number;
    }>("/store/products", { query: query(offset) });
    return { items: products, count };
  });
};

export const listSitemapCategories = async (): Promise<SitemapDoc[]> => {
  "use cache";
  cacheTag("sitemap-categories");
  cacheLife("hours");

  return fetchAllDocs(async (offset) => {
    const { product_categories: categories, count } = await sdk.client.fetch<{
      product_categories: MedusaHandle[];
      count: number;
    }>("/store/product-categories", { query: query(offset) });
    return { items: categories, count };
  });
};

export const listSitemapCollections = async (): Promise<SitemapDoc[]> => {
  "use cache";
  cacheTag("sitemap-collections");
  cacheLife("hours");

  return fetchAllDocs(async (offset) => {
    const { collections, count } = await sdk.client.fetch<{
      collections: MedusaHandle[];
      count: number;
    }>("/store/collections", { query: query(offset) });
    return { items: collections, count };
  });
};

export const listSitemapCountryCodes = async (): Promise<string[]> => {
  "use cache";
  cacheLife("hours");

  const regions = await listRegions();
  const codes = (regions ?? []).flatMap((region) =>
    (region.countries ?? []).flatMap((country) =>
      country.iso_2 ? [country.iso_2] : []
    )
  );
  return [...new Set(codes)];
};

type PayloadDoc = { slug?: string | null; updatedAt?: string | null };

const toPayloadDocs = (docs: readonly PayloadDoc[]): SitemapDoc[] =>
  docs.flatMap((doc) =>
    doc.slug ? [{ handle: doc.slug, updatedAt: doc.updatedAt }] : []
  );

// The "pages-sitemap" and "posts-sitemap" tags are revalidated by the CMS
// hooks in collections/Pages and collections/Posts when a document changes.

export const listSitemapPages = async (): Promise<SitemapDoc[]> => {
  "use cache";
  cacheTag("pages-sitemap");

  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "pages",
    overrideAccess: false,
    draft: false,
    depth: 0,
    limit: 1000,
    pagination: false,
    where: { _status: { equals: "published" } },
    select: { slug: true, updatedAt: true },
  });

  // "home" is the CMS home document; the storefront home page is the site root.
  return toPayloadDocs(docs).filter((doc) => doc.handle !== "home");
};

export const listSitemapPosts = async (): Promise<SitemapDoc[]> => {
  "use cache";
  cacheTag("posts-sitemap");

  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "posts",
    overrideAccess: false,
    draft: false,
    depth: 0,
    limit: 1000,
    pagination: false,
    where: { _status: { equals: "published" } },
    select: { slug: true, updatedAt: true },
  });

  return toPayloadDocs(docs);
};
