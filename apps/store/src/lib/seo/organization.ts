import type { Organization, WebSite, WithContext } from "schema-dts";

import { SITE_NAME, absoluteUrl } from "./site";

const ORGANIZATION_ID = "/#organization";

// schema-dts does not type `query-input`, which Google reads from SearchAction.
const SEARCH_QUERY_INPUT = {
  "query-input": "required name=search_term_string",
};

export const buildOrganizationJsonLd = (): WithContext<Organization> => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": absoluteUrl(ORGANIZATION_ID),
  name: SITE_NAME,
  url: absoluteUrl("/"),
});

export const buildWebSiteJsonLd = ({
  locale,
  countryCode,
}: {
  locale: string;
  countryCode: string;
}): WithContext<WebSite> => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": absoluteUrl("/#website"),
  name: SITE_NAME,
  url: absoluteUrl(`/${locale}/${countryCode}`),
  inLanguage: locale,
  publisher: { "@id": absoluteUrl(ORGANIZATION_ID) },
  potentialAction: {
    "@type": "SearchAction",
    target: `${absoluteUrl(`/${locale}/${countryCode}/search`)}?q={search_term_string}`,
    ...SEARCH_QUERY_INPUT,
  },
});
