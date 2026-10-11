import { isStripe, paymentInfoMap } from "@lib/constants";
import { formatDateTime } from "@lib/util/locale-format";
import { convertToLocale } from "@lib/util/money";
import { HttpTypes } from "@medusajs/types";
import { Container, Heading, Text } from "@medusajs/ui";
import { getPaymentProviderTitleKey } from "@modules/checkout/utils/payment-provider-title";
import Divider from "@modules/common/components/divider";
import { useLocale, useTranslations } from "next-intl";

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder;
};

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const t = useTranslations("order.payment");
  const tProviders = useTranslations("checkout.payment.providers");
  const locale = useLocale();

  const payment = order.payment_collections?.[0].payments?.[0];
  const providerTitleKey = payment
    ? getPaymentProviderTitleKey(payment.provider_id)
    : undefined;

  return (
    <div>
      <Heading level="h2" className="flex flex-row text-3xl-regular my-6">
        {t("title")}
      </Heading>
      <div>
        {payment && (
          <div className="flex items-start gap-x-1 w-full">
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {t("method")}
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method"
              >
                {providerTitleKey
                  ? tProviders(providerTitleKey)
                  : (paymentInfoMap[payment.provider_id]?.title ??
                    payment.provider_id)}
              </Text>
            </div>
            <div className="flex flex-col w-2/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {t("details")}
              </Text>
              <div className="flex gap-2 txt-medium text-ui-fg-subtle items-center">
                <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                  {paymentInfoMap[payment.provider_id]?.icon}
                </Container>
                <Text data-testid="payment-amount">
                  {isStripe(payment.provider_id) && payment.data?.card_last4
                    ? `**** **** **** ${payment.data.card_last4}`
                    : t("paidAt", {
                        amount: convertToLocale({
                          amount: payment.amount,
                          currency_code: order.currency_code,
                          locale,
                        }),
                        date: payment.created_at
                          ? formatDateTime(payment.created_at, locale)
                          : "",
                      })}
                </Text>
              </div>
            </div>
          </div>
        )}
      </div>

      <Divider className="mt-8" />
    </div>
  );
};

export default PaymentDetails;
