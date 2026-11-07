import { randomInt } from "node:crypto";

import type { BigNumberInput } from "@medusajs/framework/types";
import {
  BigNumber,
  MedusaError,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import type { PaymentLinkStatus } from "@payos/node";

const ORDER_CODE_RANDOM_RANGE = 1000;
const ORDER_CODE_TIME_FACTOR = 1000;

/**
 * payOS identifies a payment by a positive integer `orderCode` that must be
 * unique per payment channel. Milliseconds * 1000 + random stays far below
 * Number.MAX_SAFE_INTEGER (9.007e15) until the year 2255.
 */
export const newOrderCode = (
  now: number = Date.now(),
  random: number = randomInt(ORDER_CODE_RANDOM_RANGE)
): number => now * ORDER_CODE_TIME_FACTOR + random;

/** Medusa amounts are in major units, and a dong has no minor unit. */
export const toVndAmount = (amount: BigNumberInput): number => {
  const value = new BigNumber(amount).numeric;
  if (!(Number.isInteger(value) && value > 0)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `payOS needs a positive whole amount of VND, got ${String(value)}`
    );
  }
  return value;
};

/** How a payOS payment link maps onto a Medusa payment session. */
export const sessionStatusOf = (
  status: PaymentLinkStatus
): PaymentSessionStatus => {
  switch (status) {
    case "PAID":
      return PaymentSessionStatus.CAPTURED;
    case "UNDERPAID":
      return PaymentSessionStatus.REQUIRES_MORE;
    case "CANCELLED":
    case "EXPIRED":
      return PaymentSessionStatus.CANCELED;
    case "FAILED":
      return PaymentSessionStatus.ERROR;
    default:
      return PaymentSessionStatus.PENDING;
  }
};

const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const COUNTRY_PATTERN = /^[a-z]{2}$/;

const pick = (value: unknown, pattern: RegExp, fallback: string): string =>
  typeof value === "string" && pattern.test(value) ? value : fallback;

export type CheckoutUrlInput = {
  storefrontUrl: string;
  locale?: unknown;
  country_code?: unknown;
};

export const DEFAULT_LOCALE = "vi";
export const DEFAULT_COUNTRY = "vn";

/**
 * Where payOS sends the customer back. The browser reaches a payment session
 * through the public store API, so `locale` and `country_code` are untrusted:
 * only plain language and country codes are accepted, everything else falls
 * back to the defaults. The host always comes from our own configuration, so
 * the link can never point at another site.
 *
 * payOS appends its own query string (`code`, `id`, `cancel`, `status`,
 * `orderCode`) to this URL, so it carries no query of its own.
 */
export const checkoutReturnUrl = (input: CheckoutUrlInput): string => {
  const locale = pick(input.locale, LOCALE_PATTERN, DEFAULT_LOCALE);
  const country = pick(input.country_code, COUNTRY_PATTERN, DEFAULT_COUNTRY);
  return `${input.storefrontUrl}/${locale}/${country}/checkout/payos`;
};

const DESCRIPTION_PREFIX = "FECS";
const DESCRIPTION_MAX_LENGTH = 9;

/**
 * Bank transfer note. A channel whose bank account is not linked through payOS
 * accepts only 9 characters, so stay within that: prefix + last digits of the
 * order code.
 */
export const transferDescription = (orderCode: number): string => {
  const digits = String(orderCode);
  return `${DESCRIPTION_PREFIX}${digits.slice(-(DESCRIPTION_MAX_LENGTH - DESCRIPTION_PREFIX.length))}`;
};

export const secondsFromNow = (minutes: number, now: number = Date.now()) =>
  Math.floor(now / 1000) + minutes * 60;
