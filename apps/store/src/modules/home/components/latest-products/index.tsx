import type { HomeData } from "@lib/data/home";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import ProductPreview from "@modules/products/components/product-preview";
import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/storefront/reveal";

export default async function LatestProducts({ data }: { data: HomeData }) {
  const t = await getTranslations("home.bestSellers");

  if (data.latest.length === 0) {
    return null;
  }

  return (
    <section className="sf-section" aria-labelledby="latest-title">
      <Reveal>
        <div className="sf-section-head">
          <p className="sf-eyebrow">{t("eyebrow")}</p>
          <h2 id="latest-title" className="sf-section-title">
            {t("title")}
          </h2>
        </div>
        <ul className="sf-grid" data-testid="home-products">
          {data.latest.map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={data.region} />
            </li>
          ))}
        </ul>
        <div className="sf-center">
          <LocalizedClientLink href="/store" className="sf-btn sf-btn-dark">
            {t("viewAll")}
          </LocalizedClientLink>
        </div>
      </Reveal>
    </section>
  );
}
