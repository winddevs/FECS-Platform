"use client";

import { isManual, isPayos, isStripe } from "@lib/constants";
import { initiatePaymentSession, placeOrder } from "@lib/data/cart";
import { isPayosCheckoutUrl } from "@lib/util/payos";
import { HttpTypes } from "@medusajs/types";
import { Button } from "@medusajs/ui";
import { useElements, useStripe } from "@stripe/react-stripe-js";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import React, { useState } from "react";

import ErrorMessage from "../error-message";

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart;
  "data-testid": string;
};

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const t = useTranslations("checkout.review");
  const { locale, countryCode } = useParams<{
    locale: string;
    countryCode: string;
  }>();
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1;

  const paymentSession = cart.payment_collection?.payment_sessions?.[0];

  switch (true) {
    case isStripe(paymentSession?.provider_id):
      return (
        <StripePaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
          locale={locale}
        />
      );
    case isPayos(paymentSession?.provider_id):
      return (
        <PayosPaymentButton
          cart={cart}
          notReady={notReady}
          providerId={paymentSession?.provider_id ?? ""}
          locale={locale}
          countryCode={countryCode}
        />
      );
    case isManual(paymentSession?.provider_id):
      return (
        <ManualTestPaymentButton
          notReady={notReady}
          data-testid={dataTestId}
          locale={locale}
        />
      );
    default:
      return <Button disabled>{t("selectPaymentMethod")}</Button>;
  }
};

/**
 * Sends the customer to the hosted payOS page. The order is not placed here:
 * payOS returns the customer to /checkout/payos, which completes the cart once
 * payOS confirms the transfer.
 */
const PayosPaymentButton = ({
  cart,
  notReady,
  providerId,
  locale,
  countryCode,
}: {
  cart: HttpTypes.StoreCart;
  notReady: boolean;
  providerId: string;
  locale: string;
  countryCode: string;
}) => {
  const t = useTranslations("checkout.payos");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePayment = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      // A new session gives a new link for the current cart total, so a link
      // that expired or went stale while the customer browsed is never used.
      const { payment_collection: collection } = await initiatePaymentSession(
        cart,
        {
          provider_id: providerId,
          data: { locale, country_code: countryCode },
        }
      );
      const checkoutUrl = collection.payment_sessions?.find(
        (session) => session.provider_id === providerId
      )?.data?.checkout_url;
      if (!isPayosCheckoutUrl(checkoutUrl)) {
        throw new Error(t("linkFailed"));
      }
      // Stay in the loading state: the browser is leaving this page.
      window.location.assign(checkoutUrl);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("linkFailed"));
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid="submit-payos-button"
      >
        {t("payButton")}
      </Button>
      <p className="mt-2 txt-small text-ui-fg-subtle">{t("hint")}</p>
      <ErrorMessage
        error={errorMessage}
        data-testid="payos-payment-error-message"
      />
    </>
  );
};

const StripePaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
  locale,
}: {
  cart: HttpTypes.StoreCart;
  notReady: boolean;
  "data-testid"?: string;
  locale: string;
}) => {
  const t = useTranslations("checkout.review");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onPaymentCompleted = async () => {
    await placeOrder(locale)
      .catch((err) => {
        setErrorMessage(err.message);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const stripe = useStripe();
  const elements = useElements();
  const card = elements?.getElement("card");

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  );

  const disabled = !stripe || !elements ? true : false;

  const handlePayment = async () => {
    setSubmitting(true);

    if (!stripe || !elements || !card || !cart) {
      setSubmitting(false);
      return;
    }

    await stripe
      .confirmCardPayment(session?.data.client_secret as string, {
        payment_method: {
          card: card,
          billing_details: {
            name:
              cart.billing_address?.first_name +
              " " +
              cart.billing_address?.last_name,
            address: {
              city: cart.billing_address?.city ?? undefined,
              country: cart.billing_address?.country_code ?? undefined,
              line1: cart.billing_address?.address_1 ?? undefined,
              line2: cart.billing_address?.address_2 ?? undefined,
              postal_code: cart.billing_address?.postal_code ?? undefined,
              state: cart.billing_address?.province ?? undefined,
            },
            email: cart.email,
            phone: cart.billing_address?.phone ?? undefined,
          },
        },
      })
      .then(({ error, paymentIntent }) => {
        if (error) {
          const pi = error.payment_intent;

          if (
            (pi && pi.status === "requires_capture") ||
            (pi && pi.status === "succeeded")
          ) {
            onPaymentCompleted();
          }

          setErrorMessage(error.message || null);
          return;
        }

        if (
          (paymentIntent && paymentIntent.status === "requires_capture") ||
          paymentIntent.status === "succeeded"
        ) {
          return onPaymentCompleted();
        }

        return;
      });
  };

  return (
    <>
      <Button
        disabled={disabled || notReady}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        {t("placeOrder")}
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="stripe-payment-error-message"
      />
    </>
  );
};

const ManualTestPaymentButton = ({
  notReady,
  locale,
}: {
  notReady: boolean;
  locale: string;
}) => {
  const t = useTranslations("checkout.review");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onPaymentCompleted = async () => {
    await placeOrder(locale)
      .catch((err) => {
        setErrorMessage(err.message);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const handlePayment = () => {
    setSubmitting(true);

    onPaymentCompleted();
  };

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid="submit-order-button"
      >
        {t("placeOrder")}
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  );
};

export default PaymentButton;
