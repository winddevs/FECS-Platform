import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { useQueryGraphStep } from "@medusajs/medusa/core-flows";

import { sendNotificationStep } from "./steps/send-notification";

type WorkflowInput = {
  id: string;
  /** Invoice PDF, base64 encoded. Attached to the confirmation email when set. */
  invoice_pdf_base64?: string;
};

export const sendOrderConfirmationWorkflow = createWorkflow(
  "send-order-confirmation",
  (input: WorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "created_at",
        // BCP 47 tag, may be null. Drives the email language (see @ecommerce/email).
        "locale",
        "metadata",
        "email",
        "currency_code",
        "total",
        "items.*",
        "shipping_address.*",
        "billing_address.*",
        "shipping_methods.*",
        "customer.*",
        "total",
        "subtotal",
        "discount_total",
        "shipping_total",
        "tax_total",
        "item_subtotal",
        "item_total",
        "item_tax_total",
      ],
      filters: {
        id: input.id,
      },
    });

    const notifications = transform({ orders, input }, (data) => {
      const [order] = data.orders;
      return [
        {
          to: order.email as string,
          channel: "email",
          template: "order-placed",
          data: {
            order,
          },
          ...(data.input.invoice_pdf_base64
            ? {
                attachments: [
                  {
                    content: data.input.invoice_pdf_base64,
                    filename: `invoice-${order.display_id}.pdf`,
                    content_type: "application/pdf",
                    disposition: "attachment" as const,
                  },
                ],
              }
            : {}),
        },
      ];
    });

    const notification = sendNotificationStep(notifications);

    return new WorkflowResponse(notification);
  }
);
