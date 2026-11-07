import type { Metadata } from "next";

import { DEFAULT_LOCALE, storefrontLocales } from "@/i18n/localization";

/**
 * Canonical + hreflang alternates for a storefront path.
 *
 * `path` is the part after `/{locale}/{countryCode}`, e.g. `/store` or
 * `/products/blue-shirt`. Pass an empty string for the home page. Query
 * strings (filters, sorting, pages) are intentionally left out of the
 * canonical so filtered views do not compete with the main listing.
 */
export const localizedAlternates = ({
  locale,
  countryCode,
  path = "",
}: {
  locale: string;
  countryCode: string;
  path?: string;
}): NonNullable<Metadata["alternates"]> => {
  const build = (code: string) => `/${code}/${countryCode}${path}`;

  return {
    canonical: build(locale),
    languages: {
      ...Object.fromEntries(
        storefrontLocales.map((l) => [l.code, build(l.code)])
      ),
      "x-default": build(DEFAULT_LOCALE),
    },
  };
};
