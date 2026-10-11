import { getAuthHeaders, setCartId } from "@lib/data/cookies";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUBLISHABLE_API_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

type RouteContext = {
  params: Promise<{ locale: string; countryCode: string }>;
};

type CheckoutLinkResponse = { cart_id?: string };

/**
 * Landing page of the checkout link the Messenger bot sends (FR-SOC-007).
 *
 * The token in the link is signed for one customer and one cart. The backend
 * only hands the cart over when the logged-in customer is that customer, so a
 * link forwarded to someone else leads nowhere. On success the cart becomes
 * the visitor's cart and they continue at the normal checkout.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { locale, countryCode } = await params;
  const base = `/${locale}/${countryCode}`;
  const token = request.nextUrl.searchParams.get("token");
  const to = (path: string) =>
    NextResponse.redirect(new URL(path, request.url));

  if (!token) {
    return to(`${base}/cart`);
  }

  const auth = await getAuthHeaders();
  if (!("authorization" in auth)) {
    // The link is tied to a customer account: sign in first, then open it again.
    return to(`${base}/account`);
  }

  const response = await fetch(
    `${BACKEND_URL}/store/fashion/social/checkout-link?token=${encodeURIComponent(token)}`,
    {
      headers: {
        ...auth,
        "x-publishable-api-key": PUBLISHABLE_API_KEY,
      },
      cache: "no-store",
    }
  );
  if (!response.ok) {
    // 400: expired or tampered token, 403: someone else's link.
    return to(
      `${base}/cart?social_link=${response.status === 403 ? "forbidden" : "invalid"}`
    );
  }
  const { cart_id: cartId } = (await response.json()) as CheckoutLinkResponse;
  if (!cartId) {
    return to(`${base}/cart?social_link=invalid`);
  }
  await setCartId(cartId);
  return to(`${base}/checkout?step=address`);
}
