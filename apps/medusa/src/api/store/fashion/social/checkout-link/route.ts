import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { verifyCheckoutToken } from "../../../../../lib/social/checkout-link";

/** Exchanges a signed checkout-link token for the cart id (storefront calls this). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const secret = process.env.SOCIAL_LINK_SECRET;
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const verified = secret && token ? verifyCheckoutToken(token, secret) : null;
  if (!verified) {
    res.status(400).json({ code: "INVALID_OR_EXPIRED_TOKEN" });
    return;
  }
  res.json(verified);
}
