import { Gem, Heart, Scissors } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/storefront/reveal";

export default async function Values() {
  const t = await getTranslations("home.values");

  const values = [
    { key: "quality", Icon: Gem },
    { key: "craft", Icon: Scissors },
    { key: "care", Icon: Heart },
  ] as const;

  return (
    <section className="sf-section" aria-labelledby="values-title">
      <Reveal>
        <div className="sf-section-head">
          <p className="sf-eyebrow">{t("eyebrow")}</p>
          <h2 id="values-title" className="sf-section-title">
            {t("title")}
          </h2>
        </div>
      </Reveal>
      <div className="sf-values-grid">
        {values.map(({ key, Icon }, index) => (
          <Reveal key={key} delay={index}>
            <div className="sf-value">
              <Icon strokeWidth={1.2} aria-hidden="true" />
              <h3>{t(`${key}.title`)}</h3>
              <p>{t(`${key}.text`)}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
