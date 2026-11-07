import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

import { localization, storefrontLocales } from "./localization";

export const routing = defineRouting({
  locales: storefrontLocales.map((locale) => locale.code),
  defaultLocale: localization.defaultLocale,
  localePrefix: "always",
  // Off on purpose. The middleware's hreflang `Link` response header is a copy
  // of what each page already puts in <head> (see lib/seo/alternates.ts), and
  // it was appended to again on every cache refresh. On production the header
  // reached 13 KB on /en/vn (36 copies) and /vi/vn returned 502 because the
  // response headers no longer fit.
  alternateLinks: false,
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);

export type Locale = (typeof routing.locales)[number];
