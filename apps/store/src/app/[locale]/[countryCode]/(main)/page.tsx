import { localizedAlternates } from "@lib/seo/alternates";
import { JsonLd } from "@lib/seo/json-ld";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@lib/seo/organization";
import HomeContent from "@modules/home/components/home-content";
import HomeFallback from "@modules/home/components/home-fallback";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export async function generateMetadata(props: {
  params: Promise<{ locale: string; countryCode: string }>;
}): Promise<Metadata> {
  const { locale, countryCode } = await props.params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates({ locale, countryCode }),
  };
}

export default async function Home(props: {
  params: Promise<{ locale: string; countryCode: string }>;
}) {
  const params = await props.params;
  const { locale, countryCode } = params;

  return (
    <>
      <JsonLd id="organization-json-ld" code={buildOrganizationJsonLd()} />
      <JsonLd
        id="website-json-ld"
        code={buildWebSiteJsonLd({ locale, countryCode })}
      />
      <Suspense fallback={<HomeFallback />}>
        <HomeContent countryCode={countryCode} />
      </Suspense>
    </>
  );
}
