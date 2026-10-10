import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 60 * 60;

const b64 = (value: string): string => Buffer.from(value).toString("base64url");

/**
 * Short-lived, tamper-proof checkout link token (FR-SOC-007). Payment itself
 * always happens on the web checkout; chat never collects card data.
 */
export const signCheckoutToken = (
  cartId: string,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  nowMs = Date.now()
): string => {
  const payload = b64(
    JSON.stringify({ c: cartId, e: Math.floor(nowMs / 1000) + ttlSeconds })
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
): { cart_id: string } | null => {
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
    const { c, e } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as {
      c: string;
      e: number;
    };
    return e * 1000 > nowMs ? { cart_id: c } : null;
  } catch {
    return null;
  }
};
