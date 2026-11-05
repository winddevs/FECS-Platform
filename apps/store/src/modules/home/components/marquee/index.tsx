import { getTranslations } from "next-intl/server";
import { Fragment } from "react";

// Even count: the track slides by -50%, so the second half must equal the
// first. Four passes keep the strip wider than large screens.
const PASSES = [0, 1, 2, 3] as const;

/** Decorative scrolling strip of brand promises. Hidden from assistive tech. */
export default async function Marquee() {
  const t = await getTranslations("home.marquee");
  const items = [t("one"), t("two"), t("three"), t("four")];

  return (
    <div className="sf-marquee" aria-hidden="true">
      <div className="sf-marquee-track">
        {PASSES.flatMap((pass) =>
          items.map((item) => (
            <Fragment key={`${pass}-${item}`}>
              <span>{item}</span>
              <i>•</i>
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}
