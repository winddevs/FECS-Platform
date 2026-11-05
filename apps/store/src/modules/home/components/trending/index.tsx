import type { HomeData } from "@lib/data/home";
import ProductPreview from "@modules/products/components/product-preview";
import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/storefront/reveal";

import { TrendingTabs } from "./tabs";

export default async function Trending({ data }: { data: HomeData }) {
  const t = await getTranslations("home.trending");
  const tabs = data.tabs.filter((tab) => tab.products.length > 0);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <section
      className="sf-section"
      id="trending"
      aria-labelledby="trending-title"
    >
      <Reveal>
        <div className="sf-section-head !mb-0">
          <p className="sf-eyebrow">{t("eyebrow")}</p>
          <h2 id="trending-title" className="sf-section-title">
            {t("title")}
          </h2>
        </div>
        <TrendingTabs
          tabsLabel={t("tabsLabel")}
          scrollBackLabel={t("scrollBack")}
          scrollForwardLabel={t("scrollForward")}
          tabs={tabs.map((tab) => ({
            id: tab.id,
            label: tab.title ?? t("latest"),
            content: tab.products.map((product) => (
              <ProductPreview
                key={product.id}
                product={product}
                region={data.region}
                label={tab.title ?? undefined}
              />
            )),
          }))}
        />
      </Reveal>
    </section>
  );
}
