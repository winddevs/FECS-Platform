import { retrieveCustomer } from "@lib/data/customer";
import { getRegion } from "@lib/data/regions";
import AddressBook from "@modules/account/components/address-book";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ locale: string; countryCode: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "account" });

  return {
    title: t("meta.addresses.title"),
    description: t("meta.addresses.description"),
  };
}

export default async function Addresses(props: Props) {
  const params = await props.params;
  const { countryCode, locale } = params;
  const t = await getTranslations({ locale, namespace: "account" });
  const customer = await retrieveCustomer();
  const region = await getRegion(countryCode);

  if (!customer || !region) {
    notFound();
  }

  return (
    <div className="w-full" data-testid="addresses-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">{t("pages.addresses.title")}</h1>
        <p className="text-base-regular">{t("pages.addresses.description")}</p>
      </div>
      <AddressBook customer={customer} region={region} />
    </div>
  );
}
