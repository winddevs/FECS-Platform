import InteractiveLink from "@modules/common/components/interactive-link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("errors");
  return {
    title: "404",
    description: t("title"),
  };
};

export default async function NotFound() {
  const t = await getTranslations();
  const tErrors = await getTranslations("errors");

  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">
        {tErrors("pageNotFound")}
      </h1>
      <p className="text-small-regular text-ui-fg-base">
        {t("page-not-found")}
      </p>
      <InteractiveLink href="/">{t("go-home")}</InteractiveLink>
    </div>
  );
}
