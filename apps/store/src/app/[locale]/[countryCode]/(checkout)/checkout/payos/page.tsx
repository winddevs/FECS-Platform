import PayosReturn from "@modules/checkout/components/payos-return";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> => {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout.payos" });
  return {
    robots: { follow: false, index: false },
    title: t("confirming"),
  };
};

/** Landing page after the payOS payment page; see PayosReturn. */
export default function PayosReturnPage() {
  return (
    <div className="content-container py-24">
      <Suspense>
        <PayosReturn />
      </Suspense>
    </div>
  );
}
