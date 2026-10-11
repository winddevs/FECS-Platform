import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";

import { generateInvoicePdfWorkflow } from "../workflows/generate-invoice-pdf";
import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation";
import { trackOrderPlacedWorkflow } from "../workflows/track-order-placed";

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await trackOrderPlacedWorkflow(container).run({
    input: {
      id: data.id,
    },
  });

  // The invoice is attached to the single order confirmation email. A failure
  // to render it must never block the confirmation itself.
  let invoicePdfBase64: string | undefined;
  try {
    const {
      result: { pdf_buffer },
    } = await generateInvoicePdfWorkflow(container).run({
      input: {
        order_id: data.id,
      },
    });
    // Medusa notification attachments carry base64 content; the SMTP
    // provider forwards it as-is.
    invoicePdfBase64 = Buffer.from(pdf_buffer).toString("base64");
  } catch (error) {
    const logger = container.resolve("logger");
    logger.warn(
      `Could not generate the invoice for order ${data.id}; sending the confirmation without it: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  await sendOrderConfirmationWorkflow(container).run({
    input: {
      id: data.id,
      invoice_pdf_base64: invoicePdfBase64,
    },
  });
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
