import { trace } from "@opentelemetry/api";

type Attributes = Record<string, string | number | boolean | undefined>;

/**
 * Adds business identifiers to the active span (TDD s.48: order.id, sku,
 * mo.id, shipment.id, event.id...). Medusa already traces HTTP, workflows,
 * queries and DB; this makes those traces searchable by business key.
 *
 * Never pass PII or secrets (names, phones, addresses, message text, tokens).
 */
export const annotate = (attributes: Attributes): void => {
  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  }
};
