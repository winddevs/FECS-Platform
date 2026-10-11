import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Button, Container, Heading, Text, toast } from "@medusajs/ui";
import { useState } from "react";

import { tr } from "../lib/i18n";
import { sdk } from "../lib/sdk";

const OrderInvoiceWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadInvoice = async () => {
    setIsDownloading(true);

    try {
      const response: Response = await sdk.client.fetch(
        `/admin/orders/${order.id}/invoices`,
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
      toast.success(tr("Invoice generated and downloaded successfully"));
    } catch (error) {
      toast.error(
        tr("Failed to generate invoice: {error}", { error: String(error) })
      );
      setIsDownloading(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">{tr("Invoice")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {tr("Generate and download invoice for this order")}
          </Text>
        </div>
      </div>

      <div className="flex items-center justify-end px-6 py-4">
        <Button
          variant="secondary"
          disabled={isDownloading}
          onClick={downloadInvoice}
          isLoading={isDownloading}
        >
          {tr("Download Invoice")}
        </Button>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
});

export default OrderInvoiceWidget;
