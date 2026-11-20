import { absoluteUrl } from "@lib/seo/site";
import type { MetadataRoute } from "next";

/**
 * Served at /robots.txt. It must live at the app root: crawlers only read the
 * file at the root of the host, never under /{locale}/{country}.
 *
 * Public pages stay open to every crawler, search engines and AI agents alike.
 * Private areas are closed. The Payload media route stays open because product
 * images are served from it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/media/"],
        disallow: [
          "/admin",
          "/api/",
          "/next/",
          "/*/*/cart",
          "/*/*/checkout",
          "/*/*/account",
          "/*/*/order/",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
