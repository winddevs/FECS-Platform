# Skill: seo-geo

## Purpose

SEO and GEO (Generative Engine Optimization) standards for the bibaestudios storefront (`apps/store`, Next.js App Router, Vietnamese default with English and other locales).

Site: `https://bibaestudios.com`. URL shape: `/{locale}/{countryCode}/...` (for example `/vi/vn/products/{handle}`).

## Use the existing helpers

Do not hand-roll metadata or JSON-LD. The store already has:

- `lib/seo/metadata.ts` → `createMetadata({ title, description, image, locale, alternates })` (adds the site name suffix, Open Graph, Twitter card, default hreflang map)
- `lib/seo/json-ld.tsx` → `<JsonLd id="..." code={...} />` (escapes `<` so catalog text cannot close the script tag)
- `lib/seo/product.ts` → `toMetaDescription()`, `toStructuredDescription()` and `buildProductJsonLd()` (`ProductGroup` with one `Offer` per variant, `Product` for a single variant)
- `lib/seo/breadcrumbs.ts` → `buildBreadcrumbJsonLd()` and `buildCollectionPageJsonLd()`
- `lib/seo/organization.ts` → `buildOrganizationJsonLd()` and `buildWebSiteJsonLd()` (home page)
- `lib/seo/sitemap.ts` + `lib/data/sitemap.ts` → data and entries for `app/sitemap.ts`
- `modules/products/components/product-facts` → server-rendered "Quick facts" block on the product page (stock, options, material, delivery, returns). Radix accordion panels are not in the HTML when closed, so facts agents need must not live only there
- `lib/seo/llms.ts` + `lib/data/catalog-outline.ts` → `/llms.txt` (`app/llms.txt/route.ts`), text comes from the i18n files
- `lib/feeds/google-merchant.ts` + `lib/data/feed.ts` → Google Merchant Center feed served at `/feeds/google.xml?country=vn` (`app/feeds/google.xml/route.ts`). Keep a dot in feed paths: the locale proxy skips paths containing ".", and would redirect anything else to `/vi/...`

## Metadata — required on every page

```tsx
// app/[locale]/[countryCode]/(main)/products/[handle]/page.tsx
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, countryCode, handle } = await props.params;
  return createMetadata({
    title: product.title,
    description: toMetaDescription(product.description, product.title), // <= 160 chars
    locale,
    image: product.thumbnail ?? undefined, // 1200x630 Open Graph image
    alternates: {
      canonical: `/${locale}/${countryCode}/products/${handle}`,
      languages: {
        vi: `/vi/${countryCode}/products/${handle}`,
        en: `/en/${countryCode}/products/${handle}`,
        "x-default": `/vi/${countryCode}/products/${handle}`,
      },
    },
  });
}
```

Notes:

- `metadataBase` is set in the root layout from `getServerSideURL()` (`NEXT_PUBLIC_SERVER_URL`, `https://bibaestudios.com` in production), so use relative paths for canonical and alternates.
- `createMetadata` defaults canonical to `/`. Always override `alternates.canonical` on every non-home page.

## Structured data (JSON-LD)

Use schema.org types that fit a fashion store:

| Page                  | Type                                                         |
| --------------------- | ------------------------------------------------------------ |
| Product detail        | `ProductGroup` + per-variant `Offer`, or `Product` + `Offer` |
| Category / collection | `CollectionPage` or `ItemList`                               |
| Home                  | `Organization` + `WebSite` (with `SearchAction`)             |
| FAQ / policy pages    | `FAQPage`                                                    |
| Journal / posts       | `Article` or `BlogPosting`                                   |
| Breadcrumbs           | `BreadcrumbList`                                             |

```tsx
<JsonLd
  id="product-json-ld"
  code={buildProductJsonLd({ product, url, description })}
/>
```

Rules:

- Medusa prices are already in display units. Never divide by 100.
- Use a unique `id` per `<JsonLd>` block on one page.
- Only mark up what is visible on the page.

## Content quality rules (GEO — AI citation readiness)

- **One clear H1** per page that matches the title intent.
- **Summary paragraph** in the first 100 words — AI models use it for citation snippets.
- **Factual specifics** — materials, sizes, fit, care instructions, origin, delivery times, return window. No vague marketing copy.
- **FAQ sections** on key pages (shipping, returns, sizing). Structured Q&A is cited heavily by AI search.
- Product descriptions should be plain text in Medusa `description` so they can feed meta descriptions and JSON-LD.

## Technical SEO checklist

- [ ] Canonical URL set on every page, using the locale + country path
- [ ] `hreflang` alternates for every supported locale plus `x-default` (`vi`)
- [ ] No duplicate titles or descriptions across routes
- [ ] Sitemap includes new routes (`app/sitemap.ts`, entries built in `lib/seo/sitemap.ts`). `sitemap.ts` and `robots.ts` must stay at the app root: crawlers only read `/sitemap.xml` and `/robots.txt` there, not under `/{locale}/{country}`
- [ ] `app/robots.ts` does not block public pages (keep `/api/media/` open: product images are served from it)
- [ ] JSON-LD uses `<JsonLd>` (a plain `<script>`). Never use `next/script`: it injects on the client and crawlers without JavaScript miss it
- [ ] All images have descriptive `alt` text (product title for product images)
- [ ] Core Web Vitals pass (measure with PageSpeed Insights or Lighthouse)
- [ ] No orphan pages — every page is linked from navigation, a category, or a related-products block

## Multilingual (Vietnamese / English)

- Vietnamese (`vi`) is the primary language: canonical and `x-default` point to it.
- Use `hreflang` tags for every page that exists in more than one language.
- Do not auto-redirect by IP — use the language selector.
- Keep `<html lang>` and `og:locale` in sync with the URL locale (`createMetadata` does the latter).
