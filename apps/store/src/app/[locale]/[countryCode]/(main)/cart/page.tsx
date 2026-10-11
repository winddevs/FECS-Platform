import { retrieveCart } from "@lib/data/cart";
import { retrieveCustomer } from "@lib/data/customer";
import CartTemplate from "@modules/cart/templates";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> => {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart.metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
};

export default async function Cart() {
  const cart = await retrieveCart().catch((error) => {
    console.error(error);
    return notFound();
  });

  const customer = await retrieveCustomer();

  return <CartTemplate cart={cart} customer={customer} />;
}
