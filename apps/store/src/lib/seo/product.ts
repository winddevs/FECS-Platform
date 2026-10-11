import { getProductImages } from "@lib/util/payload-images";

import type { StoreProductWithPayload } from "@/types/global";

import type { Product, WithContext } from "./json-ld";

const MAX_DESCRIPTION_LENGTH = 160;
const WHITESPACE_RUN = /\s+/g;

/** Collapses whitespace and trims a plain-text description to meta-description length. */
export const toMetaDescription = (
  text: string | null | undefined,
  fallback: string
): string => {
  const clean = (text ?? "").replace(WHITESPACE_RUN, " ").trim();
  if (!clean) {
    return fallback;
  }
  if (clean.length <= MAX_DESCRIPTION_LENGTH) {
    return clean;
  }
  return `${clean.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
};

type VariantForStock = NonNullable<StoreProductWithPayload["variants"]>[number];

const isVariantPurchasable = (variant: VariantForStock): boolean =>
  !variant.manage_inventory ||
  Boolean(variant.allow_backorder) ||
  (variant.inventory_quantity ?? 0) > 0;

/**
 * Builds schema.org Product markup (price, currency, availability) so the
 * product is eligible for rich results and is easy for AI search to cite.
 * Medusa prices are already in display units, so they are not divided by 100.
 */
export const buildProductJsonLd = ({
  product,
  url,
  description,
}: {
  product: StoreProductWithPayload;
  url: string;
  description: string;
}): WithContext<Product> => {
  const name = product.payload_product?.title || product.title;
  const images = getProductImages(product)
    .map((image) => image.url)
    .filter(Boolean);
  const pricedVariants = (product.variants ?? []).filter(
    (variant) => variant.calculated_price?.calculated_amount != null
  );
  const amounts = pricedVariants.map(
    (variant) => variant.calculated_price?.calculated_amount ?? 0
  );
  const currency = pricedVariants[0]?.calculated_price?.currency_code;
  const inStock = (product.variants ?? []).some(isVariantPurchasable);
  const availability = inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  const jsonLd: WithContext<Product> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    url,
    sku: product.variants?.find((variant) => variant.sku)?.sku ?? undefined,
    image: images.length > 0 ? images : undefined,
  };

  if (amounts.length > 0 && currency) {
    jsonLd.offers = {
      "@type": "AggregateOffer",
      priceCurrency: currency.toUpperCase(),
      lowPrice: Math.min(...amounts),
      highPrice: Math.max(...amounts),
      offerCount: amounts.length,
      availability,
      url,
    };
  }

  return jsonLd;
};
