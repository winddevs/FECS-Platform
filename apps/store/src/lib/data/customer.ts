"use server";

import { CAPTCHA_FIELD } from "@lib/captcha/constants";
import { verifyCaptcha } from "@lib/captcha/verify";
import { sdk } from "@lib/config";
import {
  LIMITS,
  isSafeToken,
  isSupportedLocale,
  isCountryCode,
  isValidEmail,
  isValidPhone,
  readAddress,
  readPassword,
  readText,
} from "@lib/util/form-input";
import medusaError from "@lib/util/medusa-error";
import { allowRequest, clientAddress } from "@lib/util/rate-limit";
import { HttpTypes } from "@medusajs/types";
import { getTranslations } from "next-intl/server";
import { cacheTag } from "next/cache";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAuthHeaders,
  getCacheTag,
  getCartId,
  removeAuthToken,
  removeCartId,
  setAuthToken,
} from "./cookies";

async function fetchCachedCustomer(
  headers: Record<string, string>
): Promise<HttpTypes.StoreCustomer | null> {
  "use cache";
  cacheTag("customers");

  return sdk.client
    .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
      method: "GET",
      query: {
        fields: "*orders",
      },
      headers,
    })
    .then(({ customer }) => customer)
    .catch(() => null);
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const authHeaders = await getAuthHeaders();

    if (!authHeaders) return null;

    return fetchCachedCustomer(authHeaders);
  };

const MAX_PROFILE_FIELD = LIMITS.name;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE = 422;

type ServerError = { status?: number };

/** The backend rejected the credentials or the input (not an outage). */
const isClientFault = (error: unknown): boolean => {
  const status = (error as ServerError | undefined)?.status;
  return (
    status === HTTP_UNAUTHORIZED ||
    status === HTTP_BAD_REQUEST ||
    status === HTTP_UNPROCESSABLE
  );
};

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  // Only the fields the profile forms send are allowed, each bounded.
  const clean: HttpTypes.StoreUpdateCustomer = {};
  for (const key of ["first_name", "last_name"] as const) {
    const value = body[key];
    if (typeof value === "string") {
      clean[key] = value.trim().slice(0, MAX_PROFILE_FIELD);
    }
  }
  if (typeof body.phone === "string") {
    const phone = body.phone.trim();
    if (phone !== "" && !isValidPhone(phone)) {
      const t = await getTranslations("account.errors");
      throw new Error(t("invalidInput"));
    }
    clean.phone = phone;
  }
  body = clean;
  const headers = {
    ...(await getAuthHeaders()),
  };

  const updateRes = await sdk.store.customer
    .update(body, {}, headers)
    .then(({ customer }) => customer)
    .catch(medusaError);

  const cacheTag = await getCacheTag("customers");
  revalidateTag(cacheTag);

  return updateRes;
};

export async function signup(_currentState: unknown, formData: FormData) {
  const t = await getTranslations("account.errors");

  const password = readPassword(formData);
  const customerForm = {
    email: readText(formData, "email", LIMITS.email).toLowerCase(),
    first_name: readText(formData, "first_name", LIMITS.name),
    last_name: readText(formData, "last_name", LIMITS.name),
    phone: readText(formData, "phone", LIMITS.phone),
  };

  if (!isValidEmail(customerForm.email)) {
    return t("invalidEmail");
  }
  if (!(customerForm.first_name && customerForm.last_name)) {
    return t("invalidInput");
  }
  if (customerForm.phone !== "" && !isValidPhone(customerForm.phone)) {
    return t("invalidInput");
  }
  if (
    password.length < LIMITS.passwordMin ||
    password.length > LIMITS.passwordMax
  ) {
    return t("passwordLength", {
      min: LIMITS.passwordMin,
      max: LIMITS.passwordMax,
    });
  }

  const address = await clientAddress();
  const allowed =
    (await allowRequest(`signup:ip:${address}`, 10, FIFTEEN_MINUTES_MS)) &&
    (await allowRequest(
      `signup:email:${customerForm.email}`,
      5,
      FIFTEEN_MINUTES_MS
    ));
  if (!allowed) {
    return t("tooManyAttempts");
  }

  const captcha = await verifyCaptcha(formData.get(CAPTCHA_FIELD));
  if (!captcha.ok) {
    return t(
      captcha.reason === "unavailable" ? "captchaUnavailable" : "captchaFailed"
    );
  }

  try {
    const token = await sdk.auth.register("customer", "emailpass", {
      email: customerForm.email,
      password: password,
    });

    await setAuthToken(token as string);

    const headers = {
      ...(await getAuthHeaders()),
    };

    const { customer: createdCustomer } = await sdk.store.customer.create(
      customerForm,
      {},
      headers
    );

    const loginToken = await sdk.auth.login("customer", "emailpass", {
      email: customerForm.email,
      password,
    });

    await setAuthToken(loginToken as string);

    const customerCacheTag = await getCacheTag("customers");
    revalidateTag(customerCacheTag);

    await transferCart();

    // The form state is shown as an error message, so success returns nothing.
    void createdCustomer;
    return null;
  } catch (error: unknown) {
    // Never leave a half-created session behind.
    await removeAuthToken();
    // One message for "email taken" and every other failure: the form must
    // not reveal which emails already have an account.
    return t("signupFailed");
  }
}

export async function login(_currentState: unknown, formData: FormData) {
  const t = await getTranslations("account.errors");

  const email = readText(formData, "email", LIMITS.email).toLowerCase();
  const password = readPassword(formData);

  if (
    !isValidEmail(email) ||
    password.length === 0 ||
    password.length > LIMITS.passwordMax
  ) {
    return t("invalidCredentials");
  }

  // Throttle guessing per address and per account, so rotating one of the
  // two does not help an attacker.
  const address = await clientAddress();
  const allowed =
    (await allowRequest(`login:ip:${address}`, 30, FIFTEEN_MINUTES_MS)) &&
    (await allowRequest(`login:email:${email}`, 10, FIFTEEN_MINUTES_MS));
  if (!allowed) {
    return t("tooManyAttempts");
  }

  const captcha = await verifyCaptcha(formData.get(CAPTCHA_FIELD));
  if (!captcha.ok) {
    return t(
      captcha.reason === "unavailable" ? "captchaUnavailable" : "captchaFailed"
    );
  }

  try {
    await sdk.auth
      .login("customer", "emailpass", { email, password })
      .then(async (token) => {
        await setAuthToken(token as string);
        const customerCacheTag = await getCacheTag("customers");
        revalidateTag(customerCacheTag);
      });
  } catch (error: unknown) {
    // Wrong password and unknown email look the same to the visitor.
    return isClientFault(error) ? t("invalidCredentials") : t("invalidInput");
  }

  try {
    await transferCart();
  } catch {
    // The user is signed in; a failed cart transfer must not block that.
    return;
  }
}

export async function signout(countryCode: string, locale: string) {
  // These come from the client; never build a redirect from unchecked input.
  if (!(isCountryCode(countryCode) && isSupportedLocale(locale))) {
    redirect("/");
  }
  await sdk.auth.logout();

  await removeAuthToken();

  const customerCacheTag = await getCacheTag("customers");
  revalidateTag(customerCacheTag);

  await removeCartId();

  const cartCacheTag = await getCacheTag("carts");
  revalidateTag(cartCacheTag);

  redirect(`/${locale}/${countryCode}/account`);
}

export async function transferCart() {
  const cartId = await getCartId();

  if (!cartId) {
    return;
  }

  const headers = await getAuthHeaders();

  await sdk.store.cart.transferCart(cartId, {}, headers);

  const cartCacheTag = await getCacheTag("carts");
  revalidateTag(cartCacheTag);
}

export const addCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const t = await getTranslations("account.errors");
  const isDefaultBilling = (currentState.isDefaultBilling as boolean) || false;
  const isDefaultShipping =
    (currentState.isDefaultShipping as boolean) || false;

  const fields = readAddress(formData);
  if (!fields) {
    return { success: false, error: t("invalidAddress") };
  }

  const address = {
    ...fields,
    is_default_billing: isDefaultBilling,
    is_default_shipping: isDefaultShipping,
  };

  const headers = {
    ...(await getAuthHeaders()),
  };

  return sdk.store.customer
    .createAddress(address, {}, headers)
    .then(async ({ customer }) => {
      const customerCacheTag = await getCacheTag("customers");
      revalidateTag(customerCacheTag);
      return { success: true, error: null };
    })
    .catch(() => {
      return { success: false, error: t("invalidInput") };
    });
};

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  // The id is placed in the request path: reject anything but a plain token.
  if (!isSafeToken(addressId, LIMITS.idToken)) {
    return;
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  await sdk.store.customer
    .deleteAddress(addressId, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers");
      revalidateTag(customerCacheTag);
      return { success: true, error: null };
    })
    .catch(() => {
      return { success: false, error: null };
    });
};

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const t = await getTranslations("account.errors");
  const addressId = String(
    (currentState.addressId as string) || formData.get("addressId") || ""
  );

  if (!isSafeToken(addressId, LIMITS.idToken)) {
    return { success: false, error: t("invalidInput") };
  }

  const fields = readAddress(formData);
  if (!fields) {
    return { success: false, error: t("invalidAddress") };
  }

  const address = {
    first_name: fields.first_name,
    last_name: fields.last_name,
    company: fields.company,
    address_1: fields.address_1,
    address_2: fields.address_2,
    city: fields.city,
    postal_code: fields.postal_code,
    province: fields.province,
    country_code: fields.country_code,
  } as HttpTypes.StoreUpdateCustomerAddress;

  if (fields.phone) {
    address.phone = fields.phone;
  }

  const headers = {
    ...(await getAuthHeaders()),
  };

  // Ownership is enforced by the backend: it only updates addresses that
  // belong to the customer in the bearer token.
  return sdk.store.customer
    .updateAddress(addressId, address, {}, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers");
      revalidateTag(customerCacheTag);
      return { success: true, error: null };
    })
    .catch(() => {
      return { success: false, error: t("invalidInput") };
    });
};
