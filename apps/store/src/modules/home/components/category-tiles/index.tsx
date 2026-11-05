import type { HomeData } from "@lib/data/home";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

import { Reveal } from "@/components/storefront/reveal";

export default async function CategoryTiles({
  tiles,
}: {
  tiles: HomeData["tiles"];
}) {
  const t = await getTranslations("home.categories");

  if (tiles.length === 0) {
    return null;
  }

  return (
    <section className="sf-section" aria-labelledby="categories-title">
      <Reveal>
        <div className="sf-section-head">
          <p className="sf-eyebrow">{t("eyebrow")}</p>
          <h2 id="categories-title" className="sf-section-title">
            {t("title")}
          </h2>
        </div>
      </Reveal>
      <div className="sf-tiles">
        {tiles.map((tile, index) => (
          <Reveal key={tile.id} delay={index}>
            <LocalizedClientLink href={tile.href} className="sf-tile">
              {tile.image && (
                <Image
                  src={tile.image}
                  alt=""
                  fill
                  sizes="(max-width: 1023px) 50vw, 25vw"
                  quality={70}
                />
              )}
              <span className="sf-tile-label">
                {tile.title}
                <em>{t("shop")} &rarr;</em>
              </span>
            </LocalizedClientLink>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
