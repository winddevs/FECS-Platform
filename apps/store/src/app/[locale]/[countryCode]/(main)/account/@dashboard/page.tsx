import { retrieveCustomer } from "@lib/data/customer";
import { listOrders } from "@lib/data/orders";
import Overview from "@modules/account/components/overview";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "account" });

  return {
    title: t("meta.overview.title"),
    description: t("meta.overview.description"),
  };
}

export default async function OverviewTemplate() {
  const customer = await retrieveCustomer().catch(() => null);
  const orders = (await listOrders().catch(() => null)) || null;

  if (!customer) {
    notFound();
  }

  return <Overview customer={customer} orders={orders} />;
}
