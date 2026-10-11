import merge from "lodash.merge";
import type { Metadata } from "next";

import { DEFAULT_LOCALE, localization } from "@/i18n/localization";
import { intlTag } from "@/lib/util/locale-format";

type MetadataGenerator = Omit<Metadata, "description" | "title"> & {
  title: string;
  description: string;
  image?: string;
  /** URL locale of the page being described (default: the shop language). */
  locale?: string;
};

/** hreflang map: every supported language plus x-default (the shop language). */
const languageAlternates = (): Record<string, string> => ({
  ...Object.fromEntries(
    localization.locales.map((l) => [l.code, `/${l.code}`] as const)
  ),
  "x-default": `/${DEFAULT_LOCALE}`,
});

const applicationName = "FECS Fashion";
const author: Metadata["authors"] = {
  name: "Abbes Mohamed",
  url: "https://github.com/abbesm0hamed",
};
const publisher = "Abbes Mohamed";
const twitterHandle = "@thr3add";

export const createMetadata = ({
  title,
  description,
  image,
  locale = DEFAULT_LOCALE,
  ...properties
}: MetadataGenerator): Metadata => {
  const parsedTitle = `${title} | ${applicationName}`;
  const defaultMetadata: Metadata = {
    title: parsedTitle,
    description,
    applicationName,
    authors: [author],
    creator: author.name,
    formatDetection: {
      telephone: false,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: parsedTitle,
    },
    openGraph: {
      title: parsedTitle,
      description,
      type: "website",
      siteName: applicationName,
      locale: intlTag(locale).replace("-", "_"),
    },
    publisher,
    twitter: {
      card: "summary_large_image",
      creator: twitterHandle,
    },
    icons: {
      icon: "/favicon/favicon.ico",
    },
    manifest: "/favicon/site.webmanifest",
    alternates: {
      canonical: "/",
      languages: languageAlternates(),
    },
  };

  const metadata: Metadata = merge(defaultMetadata, properties);

  if (image && metadata.openGraph) {
    metadata.openGraph.images = [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: title,
      },
    ];
  }

  return metadata;
};
