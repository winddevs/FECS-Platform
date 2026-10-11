"use client";

import { formatDate } from "@lib/util/locale-format";
import { HttpTypes } from "@medusajs/types";
import { Text } from "@medusajs/ui";
import { Button, toast } from "@medusajs/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { sdk } from "../../../../lib/config";

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder;
  showStatus?: boolean;
};

const FULFILLMENT_STATUSES = [
  "not_fulfilled",
  "partially_fulfilled",
  "fulfilled",
  "partially_shipped",
  "shipped",
  "partially_delivered",
  "delivered",
  "canceled",
] as const;

const PAYMENT_STATUSES = [
  "not_paid",
  "awaiting",
  "authorized",
  "partially_authorized",
  "captured",
  "partially_captured",
  "partially_refunded",
  "refunded",
  "canceled",
  "requires_action",
] as const;

const isOneOf = <T extends string>(
  list: readonly T[],
  value: string
): value is T => (list as readonly string[]).includes(value);

// Fallback for statuses the storefront has no translation for.
const humanizeStatus = (str: string) => {
  const formatted = str.split("_").join(" ");
  return formatted.slice(0, 1).toUpperCase() + formatted.slice(1);
};

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const t = useTranslations("order");
  const locale = useLocale();

  const fulfillmentLabel = (status: string) =>
    isOneOf(FULFILLMENT_STATUSES, status)
      ? t(`status.fulfillment.${status}`)
      : humanizeStatus(status);

  const paymentLabel = (status: string) =>
    isOneOf(PAYMENT_STATUSES, status)
      ? t(`status.payment.${status}`)
      : humanizeStatus(status);

  const [isDownloading, setIsDownloading] = useState(false);

  const downloadInvoice = async () => {
    setIsDownloading(true);
    try {
      const response: Response = await sdk.client.fetch(
        `/store/orders/${order.id}/invoices`,
        {
          method: "GET",
          headers: {
            accept: "application/pdf",
          },
        }
      );

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${order.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setIsDownloading(false);
      toast.success(t("details.invoiceSuccess"));
    } catch (error) {
      toast.error(t("details.invoiceFailed", { error: String(error) }));
      setIsDownloading(false);
    }
  };

  return (
    <div>
      <Text>
        {t.rich("details.confirmationSent", {
          email: order.email ?? "",
          emailTag: (chunks) => (
            <span
              className="text-ui-fg-medium-plus font-semibold"
              data-testid="order-email"
            >
              {chunks}
            </span>
          ),
        })}
      </Text>
      <Text className="mt-2">
        {t("details.orderDate")}{" "}
        <span data-testid="order-date">
          {formatDate(order.created_at, locale)}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        {t("details.orderNumber")}{" "}
        <span data-testid="order-id">{order.display_id}</span>
      </Text>
      <Button
        variant="secondary"
        onClick={downloadInvoice}
        disabled={isDownloading}
        isLoading={isDownloading}
      >
        {t("details.downloadInvoice")}
      </Button>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            <Text>
              {t("details.orderStatus")}{" "}
              <span className="text-ui-fg-subtle " data-testid="order-status">
                {fulfillmentLabel(order.fulfillment_status)}
              </span>
            </Text>
            <Text>
              {t("details.paymentStatus")}{" "}
              <span
                className="text-ui-fg-subtle "
                data-testid="order-payment-status"
              >
                {paymentLabel(order.payment_status)}
              </span>
            </Text>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderDetails;
