import { retrieveOrder } from "@lib/data/orders";
import OrderDetailsTemplate from "@modules/order/templates/order-details-template";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string; locale: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const t = await getTranslations({
    locale: params.locale,
    namespace: "account",
  });
  const order = await retrieveOrder(params.id).catch(() => null);

  if (!order) {
    notFound();
  }

  return {
    title: t("meta.orderDetail.title", { displayId: order.display_id ?? "" }),
    description: t("meta.orderDetail.description"),
  };
}

export default async function OrderDetailPage(props: Props) {
  const params = await props.params;
  const order = await retrieveOrder(params.id).catch(() => null);

  if (!order) {
    notFound();
  }

  return <OrderDetailsTemplate order={order} />;
}
