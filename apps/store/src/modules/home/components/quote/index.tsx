import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/storefront/reveal";

export default async function Quote() {
  const t = await getTranslations("home.quote");

  return (
    <section className="sf-quote">
      <Reveal className="sf-quote-inner">
        <figure>
          <span className="sf-quote-mark" aria-hidden="true">
            &ldquo;
          </span>
          <blockquote className="sf-quote-text">{t("text")}</blockquote>
          <figcaption className="sf-quote-attr">
            &mdash; {t("attribution")}
          </figcaption>
        </figure>
      </Reveal>
    </section>
  );
}
