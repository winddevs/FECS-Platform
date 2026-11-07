"use client";

import { placeOrder } from "@lib/data/cart";
import { isCountryCode, isSupportedLocale } from "@lib/util/form-input";
import { Button, Heading, Text } from "@medusajs/ui";
import Spinner from "@modules/common/icons/spinner";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * payOS may report the transfer a few seconds after it sends the customer
 * back, so completing the cart is retried before giving up.
 */
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Where payOS sends the customer back (returnUrl and cancelUrl are the same
 * page, payOS adds `cancel=true` when the customer backed out).
 *
 * The query string is never trusted: it only decides whether to go straight
 * back to checkout. Whether the customer paid is decided by completing the
 * cart, which makes the backend ask payOS.
 *
 * This is a client page on purpose: the cart cookie is SameSite=Strict, so the
 * request that arrives from payos.vn carries no cookie. The calls made from
 * this page are same-site and do.
 */
const PayosReturn = () => {
  const t = useTranslations("checkout.payos");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, countryCode } = useParams<{
    locale: string;
    countryCode: string;
  }>();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  const cancelled =
    searchParams.get("cancel") === "true" ||
    searchParams.get("status") === "CANCELLED";
  const validRoute = isSupportedLocale(locale) && isCountryCode(countryCode);
  const checkoutPath = `/${locale}/${countryCode}/checkout`;

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    if (!validRoute) {
      setFailed(true);
      return;
    }
    if (cancelled) {
      router.replace(`${checkoutPath}?step=payment&payos=cancelled`);
      return;
    }

    const complete = async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          // Redirects to the order confirmation when the cart completes.
          await placeOrder(locale);
        } catch {
          // Not paid yet, or payOS has not confirmed it: try again below.
        }
        if (attempt < MAX_ATTEMPTS) {
          await wait(RETRY_DELAY_MS);
        }
      }
      setFailed(true);
    };
    void complete();
  }, [cancelled, checkoutPath, locale, router, validRoute]);

  if (failed) {
    return (
      <div
        className="flex flex-col items-center gap-y-4 text-center"
        data-testid="payos-return-failed"
      >
        <Heading level="h1" className="text-2xl-semi">
          {t("failedTitle")}
        </Heading>
        <Text className="max-w-xl text-ui-fg-subtle">{t("failedText")}</Text>
        {validRoute && (
          <Button
            variant="secondary"
            onClick={() => router.replace(`${checkoutPath}?step=payment`)}
          >
            {t("backToCheckout")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-y-4 text-center"
      role="status"
      aria-live="polite"
      data-testid="payos-return-pending"
    >
      <Spinner />
      <Heading level="h1" className="text-2xl-semi">
        {t("confirming")}
      </Heading>
      <Text className="text-ui-fg-subtle">{t("confirmingHint")}</Text>
    </div>
  );
};

export default PayosReturn;
