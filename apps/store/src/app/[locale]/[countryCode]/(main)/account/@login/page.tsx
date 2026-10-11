import LoginTemplate from "@modules/account/templates/login-template";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "account" });

  return {
    title: t("meta.signIn.title"),
    description: t("meta.signIn.description"),
  };
}

export default function Login() {
  return <LoginTemplate />;
}
