import { getCarrierProvider } from "../../../integrations/carrier/registry";
import { ingestCarrierEventsWorkflow } from "../../../workflows/fulfillment";
import type { InboxHandler } from "../registry";

/** Applies a verified J&T tracking push that was stored in the inbox. */
export const handleJtInboxEvent: InboxHandler = async (container, event) => {
  const provider = getCarrierProvider("JT");
  const events = provider.parseWebhook?.(event.payload) ?? [];
  if (events.length === 0) {
    return;
  }
  await ingestCarrierEventsWorkflow(container).run({
    input: {
      carrier_code: provider.code,
      actor_id: "system:jt-webhook",
      correlation_id: event.id,
      events: events.map((e) => ({
        tracking_number: e.tracking_number,
        carrier_status: e.carrier_status,
        description: e.description ?? null,
        occurred_at: e.occurred_at.toISOString(),
      })),
    },
  });
};
