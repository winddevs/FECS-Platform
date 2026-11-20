import { getProductImages } from "@lib/util/payload-images";

import type { StoreProductWithPayload } from "@/types/global";

import {
  type ProductVariant,
  brandName,
  optionTitlesById,
  toStructuredDescription,
  variantAttributes,
  variantGtin,
} from "../seo/product";
import { variantUrl } from "../seo/variant-link";

/** "Apparel & Accessories > Clothing" in Google's product taxonomy. */
const APPAREL_CATEGORY_ID = "1604";
const MAX_TITLE_LENGTH = 150;
const MAX_ADDITIONAL_IMAGES = 10;
const GENDERS = new Set(["male", "female", "unisex"]);
const AGE_GROUPS = new Set(["newborn", "infant", "toddler", "kids", "adult"]);

export type GoogleFeedAvailability = "in_stock" | "out_of_stock" | "backorder";

/** One purchasable variant, in the shape of a Google Merchant Center item. */
export type GoogleFeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  availability: GoogleFeedAvailability;
  price: string;
  salePrice?: string;
  brand: string;
  gtin?: string;
  /** Items without a GTIN must say so, or Merchant Center asks for one. */
  identifierExists: boolean;
  itemGroupId?: string;
  color?: string;
  size?: string;
  material?: string;
  productType?: string;
  gender?: string;
  ageGroup?: string;
};

const availabilityOf = (variant: ProductVariant): GoogleFeedAvailability => {
  if (!variant.manage_inventory || (variant.inventory_quantity ?? 0) > 0) {
    return "in_stock";
  }
  return variant.allow_backorder ? "backorder" : "out_of_stock";
};

/** "450000 VND": major units, with as many decimals as the currency uses. */
const formatMoney = (amount: number, currencyCode: string): string => {
  const currency = currencyCode.toUpperCase();
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return `${amount.toFixed(digits)} ${currency}`;
};

const metadataValue = (
  product: StoreProductWithPayload,
  key: string,
  allowed: ReadonlySet<string>
): string | undefined => {
  const value = product.metadata?.[key];
  return typeof value === "string" && allowed.has(value) ? value : undefined;
};

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/**
 * Feed items for one product, one per variant that has a price in the
 * region. A product without any image is skipped: Merchant Center rejects
 * items that have no `image_link`.
 */
export const buildGoogleFeedItems = ({
  product,
  baseUrl,
  locale,
  countryCode,
}: {
  product: StoreProductWithPayload;
  baseUrl: string;
  locale: string;
  countryCode: string;
}): GoogleFeedItem[] => {
  const name = product.payload_product?.title || product.title;
  const [imageLink, ...otherImages] = getProductImages(product)
    .map((image) => image.url)
    .filter(Boolean);
  if (!imageLink) {
    return [];
  }

  const link = new URL(
    `/${locale}/${countryCode}/products/${product.handle}`,
    baseUrl
  ).href;
  const description = toStructuredDescription(product.description, name);
  const brand = brandName(product);
  const titles = optionTitlesById(product);
  const pricedVariants = (product.variants ?? []).filter(
    (variant) => variant.calculated_price?.calculated_amount != null
  );
  const hasVariants = pricedVariants.length > 1;

  return pricedVariants.flatMap((variant) => {
    const price = variant.calculated_price;
    const currency = price?.currency_code;
    const current = price?.calculated_amount;
    if (!currency || current == null) {
      return [];
    }

    const regular = Math.max(price?.original_amount ?? current, current);
    const gtin = variantGtin(variant);
    const { color, size } = variantAttributes(variant, titles);
    const variantName = variant.title ? `${name} - ${variant.title}` : name;

    return [
      {
        id: variant.id,
        title: truncate(variantName, MAX_TITLE_LENGTH),
        description,
        link: variantUrl(link, variant.id),
        imageLink,
        additionalImageLinks: otherImages.slice(0, MAX_ADDITIONAL_IMAGES),
        availability: availabilityOf(variant),
        price: formatMoney(regular, currency),
        salePrice:
          current < regular ? formatMoney(current, currency) : undefined,
        brand,
        gtin,
        identifierExists: Boolean(gtin),
        itemGroupId: hasVariants ? product.id : undefined,
        color,
        size,
        material: product.material ?? undefined,
        productType: product.categories?.[0]?.name,
        gender: metadataValue(product, "gender", GENDERS),
        ageGroup: metadataValue(product, "age_group", AGE_GROUPS),
      },
    ];
  });
};

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const XML_SPECIAL = /[&<>"']/g;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const FIRST_PRINTABLE = 0x20;

/** Drops characters XML 1.0 forbids (control codes), then escapes markup. */
const escapeXml = (text: string): string =>
  [...text]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return (
        code >= FIRST_PRINTABLE ||
        code === TAB ||
        code === LINE_FEED ||
        code === CARRIAGE_RETURN
      );
    })
    .join("")
    .replace(XML_SPECIAL, (char) => XML_ESCAPES[char] ?? char);

const element = (name: string, value: string | undefined): string =>
  value ? `<g:${name}>${escapeXml(value)}</g:${name}>` : "";

const renderItem = (item: GoogleFeedItem): string =>
  [
    "<item>",
    element("id", item.id),
    element("title", item.title),
    element("description", item.description),
    element("link", item.link),
    element("image_link", item.imageLink),
    ...item.additionalImageLinks.map((url) =>
      element("additional_image_link", url)
    ),
    element("availability", item.availability),
    element("condition", "new"),
    element("price", item.price),
    element("sale_price", item.salePrice),
    element("brand", item.brand),
    element("gtin", item.gtin),
    element("identifier_exists", item.identifierExists ? "yes" : "no"),
    element("item_group_id", item.itemGroupId),
    element("color", item.color),
    element("size", item.size),
    element("material", item.material),
    element("google_product_category", APPAREL_CATEGORY_ID),
    element("product_type", item.productType),
    element("gender", item.gender),
    element("age_group", item.ageGroup),
    "</item>",
  ]
    .filter(Boolean)
    .join("\n");

/** RSS 2.0 document with Google's `g:` namespace, ready for Merchant Center. */
export const renderGoogleFeed = ({
  title,
  link,
  description,
  items,
}: {
  title: string;
  link: string;
  description: string;
  items: readonly GoogleFeedItem[];
}): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    ...items.map(renderItem),
    "</channel>",
    "</rss>",
  ].join("\n");
