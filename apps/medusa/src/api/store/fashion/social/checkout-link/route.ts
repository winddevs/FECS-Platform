import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { verifyCheckoutToken } from "../../../../../lib/social/checkout-link";

/** Exchanges a signed checkout-link token for the cart id, for its own customer only. */
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
  // The link belongs to the customer it was created for.
  if (req.auth_context?.actor_id !== verified.customer_id) {
    res.status(403).json({ code: "FORBIDDEN" });
    return;
  }
  res.json({ cart_id: verified.cart_id });
}
