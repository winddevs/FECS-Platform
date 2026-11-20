import { getProductImages } from "@lib/util/payload-images";

import type { StoreProductWithPayload } from "@/types/global";

import type { Offer, Product, ProductGroup, WithContext } from "./json-ld";
import { SITE_NAME } from "./site";
import { variantUrl } from "./variant-link";

const MAX_DESCRIPTION_LENGTH = 160;
const MAX_STRUCTURED_DESCRIPTION_LENGTH = 5000;
const WHITESPACE_RUN = /\s+/g;
const DIGITS_ONLY = /^\d+$/;
const COMBINING_MARKS = /\p{M}/gu;
const COLOR_OPTION_TITLE = /^(colou?r|mau|mau sac)$/;
const SIZE_OPTION_TITLE = /^(size|kich co|kich thuoc|co)$/;
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

const collapseWhitespace = (text: string | null | undefined): string =>
  (text ?? "").replace(WHITESPACE_RUN, " ").trim();

/** Collapses whitespace and trims a plain-text description to meta-description length. */
export const toMetaDescription = (
  text: string | null | undefined,
  fallback: string
): string => {
  const clean = collapseWhitespace(text);
  if (!clean) {
    return fallback;
  }
  if (clean.length <= MAX_DESCRIPTION_LENGTH) {
    return clean;
  }
  return `${clean.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
};

/** Full plain-text description for structured data (not cut to meta length). */
export const toStructuredDescription = (
  text: string | null | undefined,
  fallback: string
): string => {
  const clean = collapseWhitespace(text);
  if (!clean) {
    return fallback;
  }
  return clean.slice(0, MAX_STRUCTURED_DESCRIPTION_LENGTH);
};

export type ProductVariant = NonNullable<
  StoreProductWithPayload["variants"]
>[number];
export type VariantAttribute = "color" | "size";

const isVariantPurchasable = (variant: ProductVariant): boolean =>
  !variant.manage_inventory ||
  Boolean(variant.allow_backorder) ||
  (variant.inventory_quantity ?? 0) > 0;

const availabilityOf = (
  variant: ProductVariant
): "https://schema.org/InStock" | "https://schema.org/OutOfStock" =>
  isVariantPurchasable(variant)
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

/** Lower-case, accent-free option title so "Màu sắc" and "Color" can be compared. */
const normalizeOptionTitle = (title: string): string =>
  title
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replaceAll("đ", "d")
    .trim();

const attributeForOptionTitle = (title: string): VariantAttribute | null => {
  const normalized = normalizeOptionTitle(title);
  if (COLOR_OPTION_TITLE.test(normalized)) {
    return "color";
  }
  if (SIZE_OPTION_TITLE.test(normalized)) {
    return "size";
  }
  return null;
};

export const optionTitlesById = (
  product: StoreProductWithPayload
): Map<string, string> => {
  const titles = new Map<string, string>();
  for (const option of product.payload_product?.options ?? []) {
    titles.set(option.medusa_id, option.title);
  }
  for (const option of product.options ?? []) {
    titles.set(option.id, option.title);
  }
  return titles;
};

/** Color and size of a variant, read from its option values. */
export const variantAttributes = (
  variant: ProductVariant,
  titles: Map<string, string>
): Partial<Record<VariantAttribute, string>> => {
  const attributes: Partial<Record<VariantAttribute, string>> = {};
  for (const optionValue of variant.options ?? []) {
    const title =
      optionValue.option?.title ?? titles.get(optionValue.option_id ?? "");
    const attribute = title ? attributeForOptionTitle(title) : null;
    if (attribute && optionValue.value && !attributes[attribute]) {
      attributes[attribute] = optionValue.value;
    }
  }
  return attributes;
};

const isGtin = (value: string | null | undefined): value is string =>
  Boolean(value) &&
  DIGITS_ONLY.test(value as string) &&
  GTIN_LENGTHS.has((value as string).length);

/** First valid GTIN (8, 12, 13 or 14 digits) among the variant's barcodes. */
export const variantGtin = (variant: ProductVariant): string | undefined =>
  [variant.ean, variant.upc, variant.barcode].find(isGtin) ?? undefined;

const buildOffer = (variant: ProductVariant, url: string): Offer | null => {
  const price = variant.calculated_price;
  const amount = price?.calculated_amount;
  const currency = price?.currency_code;
  if (amount == null || !currency) {
    return null;
  }
  return {
    "@type": "Offer",
    url,
    price: amount,
    priceCurrency: currency.toUpperCase(),
    availability: availabilityOf(variant),
    itemCondition: "https://schema.org/NewCondition",
    seller: { "@type": "Organization", name: SITE_NAME },
  };
};

/** Brand shown on the product: `metadata.brand` in Medusa, else the shop name. */
export const brandName = (product: StoreProductWithPayload): string => {
  const brand = product.metadata?.brand;
  return typeof brand === "string" && brand.trim() ? brand.trim() : SITE_NAME;
};

const brandOf = (product: StoreProductWithPayload) => ({
  "@type": "Brand" as const,
  name: brandName(product),
});

const buildVariantJsonLd = ({
  variant,
  name,
  url,
  images,
  titles,
}: {
  variant: ProductVariant;
  name: string;
  url: string;
  images: string[];
  titles: Map<string, string>;
}): Product => {
  const { color, size } = variantAttributes(variant, titles);
  const linkedUrl = variantUrl(url, variant.id);
  return {
    "@type": "Product",
    name: variant.title ? `${name} - ${variant.title}` : name,
    sku: variant.sku ?? undefined,
    gtin: variantGtin(variant),
    color,
    size,
    url: linkedUrl,
    image: images.length > 0 ? images : undefined,
    offers: buildOffer(variant, linkedUrl) ?? undefined,
  };
};

/**
 * Builds schema.org markup (price, currency, availability) so the product is
 * eligible for rich results and is easy for AI search to cite.
 *
 * - Several variants that differ by color or size: a `ProductGroup` with one
 *   `Product` and `Offer` per variant (the form Google recommends).
 * - One variant: a `Product` with a single `Offer`.
 * - Several variants without a color/size option: a `Product` with an
 *   `AggregateOffer` (price range).
 *
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
}): WithContext<Product> | WithContext<ProductGroup> => {
  const name = product.payload_product?.title || product.title;
  const images = getProductImages(product)
    .map((image) => image.url)
    .filter(Boolean);
  const variants = product.variants ?? [];
  const pricedVariants = variants.filter(
    (variant) => variant.calculated_price?.calculated_amount != null
  );
  const titles = optionTitlesById(product);
  const common = {
    "@context": "https://schema.org" as const,
    "@id": `${url}#product`,
    name,
    description,
    url,
    image: images.length > 0 ? images : undefined,
    brand: brandOf(product),
    material: product.material ?? undefined,
  };

  const variesBy = new Set<VariantAttribute>();
  for (const variant of pricedVariants) {
    for (const attribute of Object.keys(variantAttributes(variant, titles))) {
      variesBy.add(attribute as VariantAttribute);
    }
  }

  if (pricedVariants.length > 1 && variesBy.size > 0) {
    return {
      ...common,
      "@type": "ProductGroup",
      productGroupID: product.id,
      variesBy: [...variesBy].map(
        (attribute) => `https://schema.org/${attribute}`
      ),
      hasVariant: pricedVariants.map((variant) =>
        buildVariantJsonLd({ variant, name, url, images, titles })
      ),
    };
  }

  const jsonLd: WithContext<Product> = {
    ...common,
    "@type": "Product",
    sku: variants.find((variant) => variant.sku)?.sku ?? undefined,
    gtin: variants.length === 1 ? variantGtin(variants[0]) : undefined,
  };

  const [onlyPriced] = pricedVariants;
  if (pricedVariants.length === 1 && onlyPriced) {
    jsonLd.offers = buildOffer(onlyPriced, url) ?? undefined;
    return jsonLd;
  }

  const amounts = pricedVariants.map(
    (variant) => variant.calculated_price?.calculated_amount ?? 0
  );
  const currency = pricedVariants[0]?.calculated_price?.currency_code;
  if (amounts.length > 0 && currency) {
    jsonLd.offers = {
      "@type": "AggregateOffer",
      priceCurrency: currency.toUpperCase(),
      lowPrice: Math.min(...amounts),
      highPrice: Math.max(...amounts),
      offerCount: amounts.length,
      availability: variants.some(isVariantPurchasable)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url,
    };
  }

  return jsonLd;
};
