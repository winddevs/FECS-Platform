import { createHmac, timingSafeEqual } from "node:crypto";

type Headers = Record<string, string | string[] | undefined>;

/**
 * Webhook verification for the sandbox providers.
 *
 * The sandboxes used to accept every webhook, so a mis-set `*_SANDBOX=true`
 * in production would have turned the public webhook routes into
 * unauthenticated endpoints. Now a signed body is still required: HMAC-SHA256
 * (hex, optional `sha256=` prefix) with `SANDBOX_WEBHOOK_SECRET`. Without that
 * secret every webhook is rejected.
 */
export const verifySandboxSignature = (
  headers: Headers,
  rawBody: string,
  headerName: string
): boolean => {
  const secret = process.env.SANDBOX_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }
  const supplied = headers[headerName.toLowerCase()];
  const value = (Array.isArray(supplied) ? supplied[0] : supplied)
    ?.replace(/^sha256=/, "")
    .toLowerCase();
  if (!value) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
