import { getHomeData } from "@lib/data/home";
import { getTranslations } from "next-intl/server";

import Banners from "./banners";
import CategoryTiles from "./category-tiles";
import Hero, { type HeroSlide } from "./hero";
import LatestProducts from "./latest-products";
import Marquee from "./marquee";
import Quote from "./quote";
import Trending from "./trending";
import Values from "./values";

export default async function HomeContent({
  countryCode,
}: {
  countryCode: string;
}) {
  const t = await getTranslations("home.hero.slides");
  const data = await getHomeData(countryCode);

  const slides: HeroSlide[] = (["one", "two"] as const).map((key, index) => ({
    id: key,
    eyebrow: t(`${key}.eyebrow`),
    title: t(`${key}.title`),
    subtitle: t(`${key}.subtitle`),
    cta: t(`${key}.cta`),
    href: "/store",
    image: data?.backdrops[index] ?? null,
  }));

  return (
    <>
      <Hero slides={slides} />
      <Marquee />
      {data && (
        <>
          <Trending data={data} />
          <CategoryTiles tiles={data.tiles} />
          <Banners backdrops={data.backdrops} />
          <LatestProducts data={data} />
        </>
      )}
      <Values />
      <Quote />
    </>
  );
}
