import { routing } from "@/i18n/routing";

/**
 * Helpers for reading untrusted form input in server actions.
 *
 * Every value that reaches a server action is attacker-controlled, whatever
 * the HTML says: `maxLength`, `required` and `type="email"` only guide honest
 * users. These helpers re-check on the server.
 */

export const LIMITS = {
  email: 254,
  name: 80,
  company: 120,
  addressLine: 200,
  city: 100,
  province: 100,
  postalCode: 20,
  phone: 32,
  promoCode: 64,
  idToken: 64,
  passwordMin: 8,
  // Upper bound stops multi-megabyte "passwords" from burning hash time.
  passwordMax: 128,
} as const;

// Control characters (including NUL, CR, LF) never belong in these fields.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
// Separate, non-global copy: a global regex keeps `lastIndex` between `test` calls.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
const HAS_CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
const EMAIL_PATTERN =
  /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]{3,32}$/;
const COUNTRY_PATTERN = /^[a-z]{2}$/i;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Reads a text field: always a string, trimmed, control chars removed, capped. */
export const readText = (
  formData: FormData,
  key: string,
  maxLength: number
): string => {
  const value = formData.get(key);
  // A File (or null) is never a valid text value.
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(CONTROL_CHARS, "").trim().slice(0, maxLength);
};

/** Reads a password: only length-bounded, never trimmed or altered. */
export const readPassword = (formData: FormData, key = "password"): string => {
  const value = formData.get(key);
  return typeof value === "string"
    ? value.slice(0, LIMITS.passwordMax + 1)
    : "";
};

export const isValidEmail = (value: string): boolean =>
  value.length <= LIMITS.email && EMAIL_PATTERN.test(value);

export const isValidPhone = (value: string): boolean =>
  PHONE_PATTERN.test(value);

export const isCountryCode = (value: string): boolean =>
  COUNTRY_PATTERN.test(value);

/** Ids and promo codes: letters, digits, dash, underscore only. */
export const isSafeToken = (value: string, maxLength: number): boolean =>
  value.length > 0 && value.length <= maxLength && ID_PATTERN.test(value);

export const isSupportedLocale = (value: string): boolean =>
  routing.locales.includes(value);

/**
 * True for a same-origin path such as `/store?page=2`.
 * Rejects `//evil.com`, `/\evil.com`, absolute URLs and control characters,
 * which browsers can treat as another origin.
 */
export const isSafeInternalPath = (value: string): boolean =>
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\") &&
  !HAS_CONTROL_CHAR.test(value) &&
  !value.includes("://");

export type AddressInput = {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  postal_code: string;
  province: string;
  country_code: string;
  phone: string;
};

/**
 * Reads and validates an address. `prefix` is e.g. `shipping_address.`.
 * Returns `null` when a required part is missing or malformed.
 */
export const readAddress = (
  formData: FormData,
  prefix = ""
): AddressInput | null => {
  const read = (key: string, max: number) =>
    readText(formData, `${prefix}${key}`, max);

  const address: AddressInput = {
    first_name: read("first_name", LIMITS.name),
    last_name: read("last_name", LIMITS.name),
    company: read("company", LIMITS.company),
    address_1: read("address_1", LIMITS.addressLine),
    address_2: read("address_2", LIMITS.addressLine),
    city: read("city", LIMITS.city),
    postal_code: read("postal_code", LIMITS.postalCode),
    province: read("province", LIMITS.province),
    country_code: read("country_code", 2).toLowerCase(),
    phone: read("phone", LIMITS.phone),
  };

  const requiredPresent =
    address.first_name &&
    address.last_name &&
    address.address_1 &&
    address.city &&
    address.postal_code;
  const phoneOk = address.phone === "" || isValidPhone(address.phone);

  if (!(requiredPresent && phoneOk && isCountryCode(address.country_code))) {
    return null;
  }
  return address;
};
