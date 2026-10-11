import { retrieveOrder } from "@lib/data/orders";
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};
export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> => {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "order.metadata" });

  return {
    title: t("confirmedTitle"),
    description: t("confirmedDescription"),
    robots: { index: false, follow: false },
  };
};

export default async function OrderConfirmedPage(props: Props) {
  const params = await props.params;
  const order = await retrieveOrder(params.id).catch(() => null);

  if (!order) {
    return notFound();
  }

  return <OrderCompletedTemplate order={order} />;
}
