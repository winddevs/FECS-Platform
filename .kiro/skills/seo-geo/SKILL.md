# Skill: seo-geo

## Purpose

SEO and GEO (Generative Engine Optimization) standards for the bibaestudios storefront (`apps/store`, Next.js App Router, Vietnamese default with English and other locales).

Site: `https://bibaestudios.com`. URL shape: `/{locale}/{countryCode}/...` (for example `/vi/vn/products/{handle}`).

## Use the existing helpers

Do not hand-roll metadata or JSON-LD. The store already has:

- `lib/seo/metadata.ts` → `createMetadata({ title, description, image, locale, alternates })` (adds the site name suffix, Open Graph, Twitter card, default hreflang map)
- `lib/seo/json-ld.tsx` → `<JsonLd id="..." code={...} />` (escapes `<` so catalog text cannot close the script tag)
- `lib/seo/product.ts` → `toMetaDescription()` and `buildProductJsonLd()`

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

| Page                  | Type                                                            |
| --------------------- | --------------------------------------------------------------- |
| Product detail        | `Product` with `AggregateOffer` (price, currency, availability) |
| Category / collection | `CollectionPage` or `ItemList`                                  |
| Home                  | `Organization` + `WebSite` (with `SearchAction`)                |
| FAQ / policy pages    | `FAQPage`                                                       |
| Journal / posts       | `Article` or `BlogPosting`                                      |
| Breadcrumbs           | `BreadcrumbList`                                                |

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
- [ ] Sitemap includes new routes (`app/[locale]/[countryCode]/sitemap.ts`, `next-sitemap.mjs`)
- [ ] `robots.ts` does not block public pages
- [ ] All images have descriptive `alt` text (product title for product images)
- [ ] Core Web Vitals pass (measure with PageSpeed Insights or Lighthouse)
- [ ] No orphan pages — every page is linked from navigation, a category, or a related-products block

## Multilingual (Vietnamese / English)

- Vietnamese (`vi`) is the primary language: canonical and `x-default` point to it.
- Use `hreflang` tags for every page that exists in more than one language.
- Do not auto-redirect by IP — use the language selector.
- Keep `<html lang>` and `og:locale` in sync with the URL locale (`createMetadata` does the latter).
