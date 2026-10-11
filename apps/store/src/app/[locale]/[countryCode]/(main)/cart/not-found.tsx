import InteractiveLink from "@modules/common/components/interactive-link";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("cart.metadata");

  return {
    title: t("notFoundTitle"),
    description: t("notFoundDescription"),
  };
};

export default async function NotFound() {
  const t = await getTranslations("cart.notFound");

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">{t("title")}</h1>
      <p className="text-small-regular text-ui-fg-base">{t("description")}</p>
      <InteractiveLink href="/">{t("goHome")}</InteractiveLink>
    </div>
  );
}
