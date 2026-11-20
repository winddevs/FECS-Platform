import type { BreadcrumbList, CollectionPage, WithContext } from "schema-dts";

import { absoluteUrl } from "./site";

export type Crumb = {
  name: string;
  /** Site path, for example `/vi/vn/collections/merch`. */
  path: string;
};

/** Mirrors the visible breadcrumb trail of a page. */
export const buildBreadcrumbJsonLd = (
  crumbs: Crumb[]
): WithContext<BreadcrumbList> => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((crumb, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: crumb.name,
    item: absoluteUrl(crumb.path),
  })),
});

/** Markup for a category or collection listing page. */
export const buildCollectionPageJsonLd = ({
  name,
  description,
  path,
  locale,
}: {
  name: string;
  description?: string | null;
  path: string;
  locale: string;
}): WithContext<CollectionPage> => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name,
  description: description || undefined,
  url: absoluteUrl(path),
  inLanguage: locale,
});
