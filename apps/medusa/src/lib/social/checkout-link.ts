import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 60 * 60;

const b64 = (value: string): string => Buffer.from(value).toString("base64url");

/**
 * Short-lived, tamper-proof checkout link token (FR-SOC-007). It names the
 * customer the cart was created for, and the exchange endpoint only honours it
 * for that logged-in customer, so a forwarded link is useless to anyone else.
 * Payment itself always happens on the web checkout; chat never collects card
 * data.
 */
export const signCheckoutToken = (
  cartId: string,
  customerId: string,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  nowMs = Date.now()
): string => {
  const payload = b64(
    JSON.stringify({
      c: cartId,
      u: customerId,
      e: Math.floor(nowMs / 1000) + ttlSeconds,
    })
  );
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
};

export const verifyCheckoutToken = (
  token: string,
  secret: string,
  nowMs = Date.now()
): { cart_id: string; customer_id: string } | null => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { c?: unknown; u?: unknown; e?: unknown };
    if (
      typeof claims.c !== "string" ||
      typeof claims.u !== "string" ||
      typeof claims.e !== "number"
    ) {
      return null;
    }
    return claims.e * 1000 > nowMs
      ? { cart_id: claims.c, customer_id: claims.u }
      : null;
  } catch {
    return null;
  }
};
