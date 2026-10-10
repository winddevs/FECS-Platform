import type {
  CarrierProvider,
  CarrierTrackingEvent,
} from "../../integrations/carrier/provider";
import {
  SHIPMENT_STATUSES,
  type ShipmentStatus,
} from "../../modules/fulfillment/lib/shipment-state";
import type FulfillmentModuleService from "../../modules/fulfillment/service";

const isCanonical = (value: string | null): value is ShipmentStatus =>
  value !== null && (SHIPMENT_STATUSES as readonly string[]).includes(value);

/**
 * Normalises carrier events (webhook push or polling pull) into canonical
 * states and applies them idempotently behind the transition guard.
 */
export const ingestCarrierEvents = async (
  service: FulfillmentModuleService,
  provider: CarrierProvider,
  events: CarrierTrackingEvent[],
  actor: { actor_id: string; correlation_id?: string | null }
) => {
  const byTracking = new Map<string, CarrierTrackingEvent[]>();
  for (const event of events) {
    const list = byTracking.get(event.tracking_number) ?? [];
    list.push(event);
    byTracking.set(event.tracking_number, list);
  }
  const summary = {
    shipments: 0,
    applied: 0,
    ignored: 0,
    duplicates: 0,
    unknown_tracking: 0,
  };
  for (const [tracking_number, list] of byTracking) {
    const result = await service.recordTrackingEvents({
      ...actor,
      carrier_code: provider.code,
      tracking_number,
      events: list.map((event) => {
        const mapped = provider.mapStatus(event.carrier_status);
        return {
          carrier_status: event.carrier_status,
          canonical: isCanonical(mapped) ? mapped : null,
          description: event.description ?? null,
          occurred_at: event.occurred_at,
        };
      }),
    });
    if (!result.found) {
      summary.unknown_tracking += 1;
      continue;
    }
    summary.shipments += 1;
    summary.applied += result.applied;
    summary.ignored += result.ignored;
    summary.duplicates += result.duplicates;
  }
  return summary;
};
