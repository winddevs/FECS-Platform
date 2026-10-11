import { FeaturedProductsFallback } from "@modules/home/components/featured-products/FeaturedProductsFallback";
import { FeaturedProductsSection } from "@modules/home/components/featured-products/FeaturedProductsSection";
import Hero from "@modules/home/components/hero";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>;
}) {
  const params = await props.params;
  const { countryCode } = params;

  return (
    <>
      <Hero />
      <Suspense fallback={<FeaturedProductsFallback />}>
        <FeaturedProductsSection countryCode={countryCode} />
      </Suspense>
    </>
  );
}
