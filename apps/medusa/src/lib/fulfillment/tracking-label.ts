import { Modules } from "@medusajs/framework/utils";

type FulfillmentModule = {
  retrieveFulfillment: (
    id: string,
    config: { relations: string[] }
  ) => Promise<{ labels?: Array<{ tracking_number?: string | null }> }>;
  updateFulfillment: (
    id: string,
    data: {
      labels: Array<{
        tracking_number: string;
        tracking_url: string;
        label_url: string;
      }>;
    }
  ) => Promise<unknown>;
};

/** `https://carrier.example/track?code={tracking}` -> a link for one parcel. */
export const trackingUrl = (
  trackingNumber: string,
  env: NodeJS.ProcessEnv = process.env
): string => {
  const template = env.CARRIER_TRACKING_URL_TEMPLATE;
  return template
    ? template.replaceAll("{tracking}", encodeURIComponent(trackingNumber))
    : "";
};

/**
 * Writes the carrier's tracking number onto the Medusa fulfillment, so the
 * Medusa admin, order pages and e-mails show it too (FR-FUL-004). Repeating
 * the call for the same tracking number adds nothing.
 */
export const attachTrackingLabel = async (
  container: { resolve: (key: string) => unknown },
  fulfillmentId: string,
  trackingNumber: string
): Promise<{ attached: boolean }> => {
  const fulfillment = container.resolve(
    Modules.FULFILLMENT
  ) as FulfillmentModule;
  const current = await fulfillment.retrieveFulfillment(fulfillmentId, {
    relations: ["labels"],
  });
  if (
    (current.labels ?? []).some(
      (label) => label.tracking_number === trackingNumber
    )
  ) {
    return { attached: false };
  }
  await fulfillment.updateFulfillment(fulfillmentId, {
    labels: [
      ...(current.labels ?? []).map(
        (label) =>
          label as unknown as {
            tracking_number: string;
            tracking_url: string;
            label_url: string;
          }
      ),
      {
        tracking_number: trackingNumber,
        tracking_url: trackingUrl(trackingNumber),
        label_url: "",
      },
    ],
  });
  return { attached: true };
};
