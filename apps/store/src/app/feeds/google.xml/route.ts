import { getGoogleMerchantFeed } from "@lib/data/feed";
import { listSitemapCountryCodes } from "@lib/data/sitemap";

import { DEFAULT_LOCALE } from "@/i18n/localization";

const DEFAULT_COUNTRY_CODE = process.env.NEXT_PUBLIC_DEFAULT_REGION || "vn";
const FEED_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

const failure = (status: number, message: string): Response =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

/**
 * Product feed for Google Merchant Center: `/feeds/google.xml?country=vn`.
 * It serves the same public catalogue the storefront shows, so it needs no
 * login. The path contains a dot so the locale proxy leaves it alone.
 */
export async function GET(request: Request): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("country");
  const countryCode = (requested ?? DEFAULT_COUNTRY_CODE).toLowerCase();

  try {
    // Only countries a region serves are cached, so arbitrary values in the
    // query string cannot fill the cache.
    const knownCountries = await listSitemapCountryCodes();
    if (!knownCountries.includes(countryCode)) {
      return failure(404, "Unknown country");
    }

    const xml = await getGoogleMerchantFeed(countryCode, DEFAULT_LOCALE);
    return new Response(xml, { headers: FEED_HEADERS });
  } catch (error) {
    console.error(
      `Google feed failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return failure(503, "Feed is temporarily unavailable");
  }
}
