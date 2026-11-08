"use client";

import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { useTranslations } from "next-intl";

export type AddToCartStatus = "idle" | "added" | "error";

/**
 * Confirms (or reports the failure of) "add to cart". The mini cart is hidden
 * on phones, so without this a shopper there only sees a small badge change.
 * The live region is always rendered so screen readers announce the update.
 */
export default function AddToCartStatusMessage({
  status,
  className,
}: {
  status: AddToCartStatus;
  className?: string;
}) {
  const t = useTranslations("products.actions");

  return (
    <div
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      className={className}
      data-testid="add-to-cart-status"
      data-status={status}
    >
      {status === "added" && (
        <p className="flex items-center justify-between gap-x-3 text-sm">
          <span>{t("addedToCart")}</span>
          <LocalizedClientLink
            href="/cart"
            className="underline underline-offset-4"
            data-testid="add-to-cart-view-cart"
          >
            {t("viewCart")}
          </LocalizedClientLink>
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-ui-fg-error">{t("addError")}</p>
      )}
    </div>
  );
}
