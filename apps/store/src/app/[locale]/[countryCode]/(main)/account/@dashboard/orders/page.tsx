import { listOrders } from "@lib/data/orders";
import OrderOverview from "@modules/account/components/order-overview";
import TransferRequestForm from "@modules/account/components/transfer-request-form";
import Divider from "@modules/common/components/divider";
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
    title: t("meta.orders.title"),
    description: t("meta.orders.description"),
  };
}

export default async function Orders(props: Props) {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "account" });
  const orders = await listOrders();

  if (!orders) {
    notFound();
  }

  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">{t("pages.orders.title")}</h1>
        <p className="text-base-regular">{t("pages.orders.description")}</p>
      </div>
      <div>
        <OrderOverview orders={orders} />
        <Divider className="my-16" />
        <TransferRequestForm />
      </div>
    </div>
  );
}
