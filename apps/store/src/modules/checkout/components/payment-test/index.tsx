import { Badge } from "@medusajs/ui";
import { useTranslations } from "next-intl";

const PaymentTest = ({ className }: { className?: string }) => {
  const t = useTranslations("checkout.payment.testBadge");

  return (
    <Badge color="orange" className={className}>
      <span className="font-semibold">{t("label")}</span> {t("text")}
    </Badge>
  );
};

export default PaymentTest;
