import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Fragment } from "react";

import { Reveal } from "@/components/storefront/reveal";

type BannerProps = {
  /** Product photos used as backdrops; a banner without one uses a cream panel. */
  backdrops: (string | null)[];
};

/** Two editorial banners. Copy comes from the `home.banners` messages. */
export default async function Banners({ backdrops }: BannerProps) {
  const t = await getTranslations("home.banners");

  const banners = [
    {
      key: "one",
      eyebrow: t("one.eyebrow"),
      title: t("one.title"),
      cta: t("one.cta"),
      image: backdrops[2] ?? null,
    },
    {
      key: "two",
      eyebrow: t("two.eyebrow"),
      title: t("two.title"),
      cta: t("two.cta"),
      image: backdrops[3] ?? null,
    },
  ];

  return (
    <section className="sf-section">
      <div className="sf-banners">
        {banners.map((banner, index) => (
          <Reveal key={banner.key} delay={index}>
            <LocalizedClientLink
              href="/store"
              className={`sf-banner${banner.image ? " has-image" : ""}`}
            >
              {banner.image && (
                <Image
                  src={banner.image}
                  alt=""
                  fill
                  sizes="(max-width: 1023px) 100vw, 50vw"
                  quality={70}
                />
              )}
              <span className="sf-banner-copy">
                <span className="sf-eyebrow sf-eyebrow-light !text-current">
                  {banner.eyebrow}
                </span>
                <span className="sf-banner-title">
                  {banner.title.split("\n").map((line, lineIndex, lines) => (
                    <Fragment key={line}>
                      {line}
                      {lineIndex < lines.length - 1 && <br />}
                    </Fragment>
                  ))}
                </span>
                <span className="sf-btn sf-btn-light sf-btn-sm">
                  {banner.cta}
                </span>
              </span>
            </LocalizedClientLink>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
