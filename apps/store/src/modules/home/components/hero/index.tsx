import { Heading } from "@medusajs/ui";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { useTranslations } from "next-intl";

const Hero = () => {
  const t = useTranslations("home.hero");

  return (
    <div className="h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-6">
        <span>
          <Heading
            level="h1"
            className="text-3xl leading-10 text-ui-fg-base font-normal"
          >
            {t("title")}
          </Heading>
          <Heading
            level="h2"
            className="text-3xl leading-10 text-ui-fg-subtle font-normal"
          >
            {t("subtitle")}
          </Heading>
        </span>
        <LocalizedClientLink
          href="/store"
          className="inline-flex min-h-11 items-center justify-center rounded-rounded bg-ui-bg-interactive px-8 text-base font-medium text-ui-fg-on-color transition-colors hover:bg-ui-bg-interactive-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive"
          data-testid="hero-cta"
        >
          {t("cta")}
        </LocalizedClientLink>
      </div>
    </div>
  );
};

export default Hero;
