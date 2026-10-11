import merge from "lodash.merge";
import type { Metadata } from "next";

import { DEFAULT_LOCALE } from "@/i18n/localization";
import { intlTag } from "@/lib/util/locale-format";

type MetadataGenerator = Omit<Metadata, "description" | "title"> & {
  title: string;
  description: string;
  image?: string;
  /** URL locale of the page being described (default: the shop language). */
  locale?: string;
};

const applicationName = "bibaestudios";
const author = { name: applicationName };
const publisher = applicationName;

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
    },
    icons: {
      icon: "/favicon/favicon.ico",
    },
    // No default `alternates`: a root-level canonical of "/" would be inherited
    // by every page and tell search engines each one duplicates the home page.
    // Pages set their own via `localizedAlternates()` (lib/seo/alternates.ts).
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
