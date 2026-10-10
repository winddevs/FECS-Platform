import {
  CarrierError,
  type CarrierProvider,
  type CreateShipmentRequest,
} from "../../integrations/carrier/provider";
import type FulfillmentModuleService from "../../modules/fulfillment/service";
import type { ShipmentView } from "../../modules/fulfillment/service";
import { annotate } from "../observability/annotate";

export type CreateCarrierShipmentInput = {
  actor_id: string;
  correlation_id?: string | null;
  order_id: string;
  medusa_fulfillment_id?: string | null;
  return_id?: string | null;
  request: CreateShipmentRequest;
};

/**
 * Create protocol (TDD s.29/30): claim -> call carrier -> record, where an
 * ambiguous outcome is resolved by merchant reference BEFORE any retry, so a
 * timeout can never produce a second physical shipment (FR-FUL-003).
 *
 * Never throws for carrier problems: checkout/order/manufacturing must keep
 * working (NFR-AVL-001). The returned state tells callers what happened and
 * the retry job picks up FAILED_RETRYABLE / UNKNOWN shipments.
 */
export const createCarrierShipment = async (
  service: FulfillmentModuleService,
  provider: CarrierProvider,
  input: CreateCarrierShipmentInput
): Promise<ShipmentView> => {
  annotate({
    "order.id": input.order_id,
    carrier: provider.code,
    "fulfillment.id": input.medusa_fulfillment_id ?? undefined,
  });
  const actor = {
    actor_id: input.actor_id,
    correlation_id: input.correlation_id,
  };
  const claimInput = {
    ...actor,
    carrier_code: provider.code,
    medusa_fulfillment_id: input.medusa_fulfillment_id,
    return_id: input.return_id,
    order_id: input.order_id,
    merchant_reference: input.request.merchant_reference,
    request: input.request as unknown as Record<string, unknown>,
  };

  let claim = await service.claimShipment(claimInput);
  if (claim.action === "DONE") {
    return claim.shipment;
  }

  if (claim.action === "RECONCILE") {
    let found;
    try {
      found = await provider.findByMerchantReference(
        input.request.merchant_reference
      );
    } catch {
      // Carrier unreachable: stay UNKNOWN, never guess.
      return claim.shipment;
    }
    if (found) {
      return await service.recordCreateOutcome({
        ...actor,
        shipment_id: claim.shipment.id,
        outcome: { kind: "SUCCESS", ...found },
      });
    }
    await service.confirmAbsentAtCarrier(claim.shipment.id);
    claim = await service.claimShipment(claimInput);
  }

  try {
    const created = await provider.createShipment(input.request);
    return await service.recordCreateOutcome({
      ...actor,
      shipment_id: claim.shipment.id,
      outcome: { kind: "SUCCESS", ...created },
    });
  } catch (error) {
    const kind = error instanceof CarrierError ? error.kind : "AMBIGUOUS";
    const message = error instanceof Error ? error.message : String(error);
    const recorded = await service.recordCreateOutcome({
      ...actor,
      shipment_id: claim.shipment.id,
      outcome: { kind, message },
    });
    if (kind !== "AMBIGUOUS") {
      return recorded;
    }
    // Try to resolve the ambiguity right away; otherwise the job will.
    try {
      const found = await provider.findByMerchantReference(
        input.request.merchant_reference
      );
      if (found) {
        return await service.recordCreateOutcome({
          ...actor,
          shipment_id: claim.shipment.id,
          outcome: { kind: "SUCCESS", ...found },
        });
      }
    } catch {
      // stay UNKNOWN
    }
    return recorded;
  }
};
