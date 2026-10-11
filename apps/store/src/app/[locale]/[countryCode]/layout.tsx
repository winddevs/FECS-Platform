import "@/styles/globals.css";
import { createMetadata } from "@lib/seo/metadata";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
// import { getBaseURL } from '@lib/util/env';
import { notFound } from "next/navigation";
import type { TypedLocale } from "payload";

import { Header } from "@/globals/Header/DesktopNav/Component";
import { localization } from "@/i18n/localization";
import { getLocalizedMessages } from "@/i18n/request";
import { routing } from "@/i18n/routing";
import { Providers } from "@/providers";
import { InitTheme } from "@/providers/Theme/InitTheme";
import { getServerSideURL } from "@/utilities/getURL";
import { mergeOpenGraph } from "@/utilities/mergeOpenGraph";

type Args = {
  children: React.ReactNode;
  params: Promise<{
    locale: TypedLocale;
  }>;
};

// export const metadata: Metadata = {
//   metadataBase: new URL(getBaseURL()),
// };

export const instant = false;

// viewport-fit=cover lets sticky bars use env(safe-area-inset-*) on notched
// phones. Zoom stays enabled on purpose (accessibility).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children, params }: Args) {
  const { locale } = await params;
  const currentLocale = localization.locales.find((loc) => loc.code === locale);
  const direction = currentLocale?.rtl ? "rtl" : "ltr";

  if (!routing.locales.includes(locale as string)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();
  const tLayout = await getTranslations({ locale, namespace: "layout" });

  return (
    <html
      data-mode="light"
      lang={locale}
      dir={direction}
      suppressHydrationWarning
    >
      <head>
        <InitTheme />
        <link href="/favicon/favicon.ico" rel="icon" sizes="32x32" />
      </head>
      <body className="font-default">
        <Providers>
          <NextIntlClientProvider messages={messages}>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
            >
              {tLayout("skipLink")}
            </a>
            <Header locale={locale} />
            <main
              id="main-content"
              tabIndex={-1}
              className="relative outline-none"
            >
              {children}
            </main>
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  );
}

type HomeProps = {
  params: Promise<{
    locale: string;
  }>;
};

export const generateMetadata = async ({
  params,
}: HomeProps): Promise<Metadata> => {
  const { locale } = await params;
  const dictionary = await getLocalizedMessages(locale);

  const rootMeta = createMetadata({
    metadataBase: new URL(getServerSideURL()),
    locale,
    openGraph: mergeOpenGraph({
      title: dictionary.messages.metadata.title,
      description: dictionary.messages.metadata.description,
      url: new URL(getServerSideURL()),
      images: [],
    }),
    other: {
      "facebook-domain-verification": process.env.FACEBOOK_DOMAIN_VERIFICATION!,
    },
    title: dictionary.messages.metadata.title,
    description: dictionary.messages.metadata.description,
  });

  return rootMeta;
};

export function generateStaticParams() {
  const defaultRegion = process.env.NEXT_PUBLIC_DEFAULT_REGION || "vn";

  return routing.locales.map((locale) => ({
    locale,
    countryCode: defaultRegion,
  }));
}
