/** Query parameter that opens a product page with one variant selected. */
export const VARIANT_QUERY_PARAM = "variant";

/** Product URL that opens with the given variant selected. */
export const variantUrl = (productUrl: string, variantId: string): string => {
  const url = new URL(productUrl);
  url.searchParams.set(VARIANT_QUERY_PARAM, variantId);
  return url.href;
};
