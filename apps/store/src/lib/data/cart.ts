"use server";

import { sdk } from "@lib/config";
import {
  LIMITS,
  isCountryCode,
  isSafeInternalPath,
  isSafeToken,
  isSupportedLocale,
  isValidEmail,
  readAddress,
  readText,
} from "@lib/util/form-input";
import medusaError, { AppError } from "@lib/util/medusa-error";
import { HttpTypes } from "@medusajs/types";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  removeCartId,
  setCartId,
} from "./cookies";
import { getRegion } from "./regions";

/**
 * Retrieves a cart by its ID. If no ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to retrieve.
 * @returns The cart object if found, or null if not found.
 */
export async function retrieveCart(cartId?: string) {
  const id = cartId || (await getCartId());

  if (!(id && isSafeToken(id, LIMITS.idToken))) {
    return null;
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  const next = {
    ...(await getCacheOptions("carts")),
  };

  return await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${id}`, {
      method: "GET",
      query: {
        fields:
          "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name",
      },
      headers,
      next,
      cache: "force-cache",
    })
    .then(({ cart }) => cart)
    .catch(() => null);
}

export async function getOrSetCart(countryCode: string) {
  const region = await getRegion(countryCode);

  if (!region) {
    throw new AppError(
      `Region not found for country code: ${countryCode}`,
      "regionNotFound"
    );
  }

  let cart = await retrieveCart();

  const headers = {
    ...(await getAuthHeaders()),
  };

  if (!cart) {
    const cartResp = await sdk.store.cart.create(
      { region_id: region.id },
      {},
      headers
    );
    cart = cartResp.cart;

    await setCartId(cart.id);

    const cartCacheTag = await getCacheTag("carts");
    revalidateTag(cartCacheTag);
  }

  if (cart && cart?.region_id !== region.id) {
    await sdk.store.cart.update(cart.id, { region_id: region.id }, {}, headers);
    const cartCacheTag = await getCacheTag("carts");
    revalidateTag(cartCacheTag);
  }

  return cart;
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId();

  if (!cartId) {
    throw new AppError(
      "No existing cart found, please create one before updating",
      "cartNotFound"
    );
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  return sdk.store.cart
    .update(cartId, data, {}, headers)
    .then(async ({ cart }) => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);

      const fulfillmentCacheTag = await getCacheTag("fulfillment");
      revalidateTag(fulfillmentCacheTag);

      return cart;
    })
    .catch(medusaError);
}

export async function addToCart({
  variantId,
  quantity,
  countryCode,
}: {
  variantId: string;
  quantity: number;
  countryCode: string;
}) {
  if (!isSafeToken(variantId, LIMITS.idToken)) {
    throw new AppError("Missing variant ID when adding to cart", "invalidItem");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new AppError("Invalid quantity", "invalidItem");
  }
  if (!isCountryCode(countryCode)) {
    throw new AppError("Invalid country code", "regionNotFound");
  }

  const cart = await getOrSetCart(countryCode);

  if (!cart) {
    throw new AppError("Error retrieving or creating cart", "cartNotFound");
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  await sdk.store.cart
    .createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);

      const fulfillmentCacheTag = await getCacheTag("fulfillment");
      revalidateTag(fulfillmentCacheTag);
    })
    .catch(medusaError);
}

export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string;
  quantity: number;
}) {
  if (!isSafeToken(lineId, LIMITS.idToken)) {
    throw new AppError(
      "Missing lineItem ID when updating line item",
      "invalidItem"
    );
  }
  // Quantity comes from the client: whole numbers from 1 to 99 only.
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new AppError("Invalid quantity", "invalidItem");
  }

  const cartId = await getCartId();

  if (!cartId) {
    throw new AppError(
      "Missing cart ID when updating line item",
      "cartNotFound"
    );
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  await sdk.store.cart
    .updateLineItem(cartId, lineId, { quantity }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);

      const fulfillmentCacheTag = await getCacheTag("fulfillment");
      revalidateTag(fulfillmentCacheTag);
    })
    .catch(medusaError);
}

export async function deleteLineItem(lineId: string) {
  if (!isSafeToken(lineId, LIMITS.idToken)) {
    throw new AppError(
      "Missing lineItem ID when deleting line item",
      "invalidItem"
    );
  }

  const cartId = await getCartId();

  if (!cartId) {
    throw new AppError(
      "Missing cart ID when deleting line item",
      "cartNotFound"
    );
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  await sdk.store.cart
    .deleteLineItem(cartId, lineId, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);

      const fulfillmentCacheTag = await getCacheTag("fulfillment");
      revalidateTag(fulfillmentCacheTag);
    })
    .catch(medusaError);
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
}: {
  cartId: string;
  shippingMethodId: string;
}) {
  if (
    !(
      isSafeToken(cartId, LIMITS.idToken) &&
      isSafeToken(shippingMethodId, LIMITS.idToken)
    )
  ) {
    throw new AppError("Invalid shipping method", "invalidRequest");
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  return sdk.store.cart
    .addShippingMethod(cartId, { option_id: shippingMethodId }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);
    })
    .catch(medusaError);
}

export async function initiatePaymentSession(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession
) {
  const headers = {
    ...(await getAuthHeaders()),
  };

  return sdk.store.payment
    .initiatePaymentSession(cart, data, {}, headers)
    .then(async (resp) => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);
      return resp;
    })
    .catch(medusaError);
}

const MAX_PROMO_CODES = 10;

export async function applyPromotions(codes: string[]) {
  // Codes arrive from the client: keep a short list of plain strings.
  const cleanCodes = codes
    .filter((code) => typeof code === "string")
    .map((code) => code.trim())
    .filter((code) => code.length > 0 && code.length <= LIMITS.promoCode)
    .slice(0, MAX_PROMO_CODES);
  codes = cleanCodes;

  const cartId = await getCartId();

  if (!cartId) {
    throw new AppError("No existing cart found", "cartNotFound");
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  return sdk.store.cart
    .update(cartId, { promo_codes: codes }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);

      const fulfillmentCacheTag = await getCacheTag("fulfillment");
      revalidateTag(fulfillmentCacheTag);
    })
    .catch(medusaError);
}

export async function applyGiftCard(code: string) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, { gift_cards: [{ code }] }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function removeDiscount(code: string) {
  // const cartId = getCartId()
  // if (!cartId) return "No cartId cookie found"
  // try {
  //   await deleteDiscount(cartId, code)
  //   revalidateTag("cart")
  // } catch (error: any) {
  //   throw error
  // }
}

export async function removeGiftCard(
  codeToRemove: string,
  giftCards: any[]
  // giftCards: GiftCard[]
) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, {
  //       gift_cards: [...giftCards]
  //         .filter((gc) => gc.code !== codeToRemove)
  //         .map((gc) => ({ code: gc.code })),
  //     }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData
) {
  const code = readText(formData, "code", LIMITS.promoCode);
  if (!code) {
    const t = await getTranslations("account.errors");
    return t("invalidPromo");
  }
  try {
    await applyPromotions([code]);
  } catch (e: any) {
    return e.message;
  }
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(currentState: unknown, formData: FormData) {
  const t = await getTranslations("account.errors");
  let nextCountry = "";

  try {
    if (!formData) {
      throw new AppError(
        "No form data found when setting addresses",
        "invalidRequest"
      );
    }
    const cartId = await getCartId();
    if (!cartId) {
      throw new AppError(
        "No existing cart found when setting addresses",
        "cartNotFound"
      );
    }

    const email = readText(formData, "email", LIMITS.email).toLowerCase();
    const shipping = readAddress(formData, "shipping_address.");
    if (!(shipping && isValidEmail(email))) {
      return t("invalidAddress");
    }

    const sameAsBilling = formData.get("same_as_billing") === "on";
    const billing = sameAsBilling
      ? shipping
      : readAddress(formData, "billing_address.");
    if (!billing) {
      return t("invalidAddress");
    }

    // `address_2` is not collected at checkout; keep it empty as before.
    await updateCart({
      email,
      shipping_address: { ...shipping, address_2: "" },
      billing_address: { ...billing, address_2: "" },
    });
    nextCountry = shipping.country_code;
  } catch (e: any) {
    return e.message;
  }

  // Built only from validated parts (two letters + a supported locale).
  const locale = await getLocale();
  redirect(`/${locale}/${nextCountry}/checkout?step=delivery`);
}

/**
 * Places an order for a cart. If no cart ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to place an order for.
 * @returns The cart object if the order was successful, or null if not.
 */
export async function placeOrder(locale: string, cartId?: string) {
  const id = cartId || (await getCartId());
  const safeLocale = isSupportedLocale(locale) ? locale : await getLocale();

  if (!id) {
    throw new AppError(
      "No existing cart found when placing an order",
      "cartNotFound"
    );
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  const cartRes = await sdk.store.cart
    .complete(id, {}, headers)
    .then(async (cartRes) => {
      const cartCacheTag = await getCacheTag("carts");
      revalidateTag(cartCacheTag);
      return cartRes;
    })
    .catch(medusaError);

  if (cartRes?.type === "order") {
    const rawCountry =
      cartRes.order.shipping_address?.country_code?.toLowerCase() ?? "";
    const countryCode = isCountryCode(rawCountry) ? rawCountry : "";

    const orderCacheTag = await getCacheTag("orders");
    revalidateTag(orderCacheTag);

    removeCartId();
    redirect(
      `/${safeLocale}/${countryCode}/order/${cartRes?.order.id}/confirmed`
    );
  }

  return cartRes.cart;
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
export async function updateRegion(
  countryCode: string,
  currentPath: string,
  locale: string
) {
  // All three values come from the client and end up in a redirect, so a
  // forged value must never turn this into an open redirect.
  if (!(isCountryCode(countryCode) && isSupportedLocale(locale))) {
    throw new AppError("Invalid locale or country code", "invalidRequest");
  }
  const safePath = isSafeInternalPath(currentPath) ? currentPath : "";

  const cartId = await getCartId();
  const region = await getRegion(countryCode);

  if (!region) {
    throw new AppError(
      `Region not found for country code: ${countryCode}`,
      "regionNotFound"
    );
  }

  if (cartId) {
    await updateCart({ region_id: region.id });
    const cartCacheTag = await getCacheTag("carts");
    revalidateTag(cartCacheTag);
  }

  const regionCacheTag = await getCacheTag("regions");
  revalidateTag(regionCacheTag);

  const productsCacheTag = await getCacheTag("products");
  revalidateTag(productsCacheTag);

  redirect(`/${locale}/${countryCode}${safePath}`);
}

export async function listCartOptions() {
  const cartId = await getCartId();
  const headers = {
    ...(await getAuthHeaders()),
  };
  const next = {
    ...(await getCacheOptions("shippingOptions")),
  };

  return await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[];
  }>("/store/shipping-options", {
    query: { cart_id: cartId },
    next,
    headers,
    cache: "force-cache",
  });
}
