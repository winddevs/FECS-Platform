import { MedusaError } from "@medusajs/framework/utils";

import { getCarrierProvider } from "../../integrations/carrier/registry";
import { domainError, ErrorCodes } from "../../lib/errors";
import {
  createCarrierShipment,
  type CreateCarrierShipmentInput,
} from "../../lib/fulfillment/create-shipment";
import { ingestCarrierEvents } from "../../lib/fulfillment/ingest-tracking";
import { FASHION_FULFILLMENT_MODULE } from "../../modules/fulfillment";
import type FulfillmentModuleService from "../../modules/fulfillment/service";
import { wrapStep, type Resolver } from "./wrap";

const svc = (c: Resolver) =>
  c.resolve<FulfillmentModuleService>(FASHION_FULFILLMENT_MODULE);

export const createCarrierShipmentStep = wrapStep(
  "fulfillment-create-carrier-shipment",
  async (input: CreateCarrierShipmentInput & { carrier_code: string }, c) => {
    const { carrier_code, ...rest } = input;
    return await createCarrierShipment(
      svc(c),
      getCarrierProvider(carrier_code),
      rest
    );
  }
);

export const cancelCarrierShipmentStep = wrapStep(
  "fulfillment-cancel-carrier-shipment",
  async (
    input: {
      shipment_id: string;
      actor_id: string;
      correlation_id?: string | null;
    },
    c
  ) => {
    // 1. Decide under the row lock BEFORE touching the carrier.
    const shipment = await svc(c).assertCancellable(input.shipment_id);
    if (shipment.already_cancelled) {
      return { applied: false as const, reason: "ALREADY_CANCELLED" };
    }
    const provider = getCarrierProvider(shipment.carrier_code);

    // 2. Find out whether a parcel exists. A creation that is still unresolved
    // (no tracking number yet) is reconciled by merchant reference first; if
    // the carrier cannot answer, the cancel is refused rather than guessed.
    let tracking = shipment.tracking_number;
    if (
      !tracking &&
      (shipment.create_state === "UNKNOWN" ||
        shipment.create_state === "PENDING")
    ) {
      let found;
      try {
        found = await provider.findByMerchantReference(
          shipment.merchant_reference
        );
      } catch {
        throw domainError(
          MedusaError.Types.UNEXPECTED_STATE,
          ErrorCodes.INVALID_STATE,
          "The carrier could not confirm whether a parcel exists; retry the cancel"
        );
      }
      if (found) {
        await svc(c).recordCreateOutcome({
          actor_id: input.actor_id,
          correlation_id: input.correlation_id,
          shipment_id: shipment.id,
          outcome: { kind: "SUCCESS", ...found },
        });
        tracking = found.tracking_number;
      }
    }
    if (tracking) {
      await provider.cancelShipment(tracking);
    }

    // 3. Mark it cancelled; from now on no job may create it.
    return await svc(c).markCancelled(input);
  }
);
export type SerializedCarrierEvent = {
  tracking_number: string;
  carrier_status: string;
  description?: string | null;
  occurred_at: string;
};

/** Workflow inputs are JSON-serialised by the engine, so dates travel as ISO strings. */
export const ingestCarrierEventsStep = wrapStep(
  "fulfillment-ingest-carrier-events",
  async (
    input: {
      carrier_code: string;
      events: SerializedCarrierEvent[];
      actor_id: string;
      correlation_id?: string | null;
    },
    c
  ) =>
    await ingestCarrierEvents(
      svc(c),
      getCarrierProvider(input.carrier_code),
      input.events.map((e) => ({ ...e, occurred_at: new Date(e.occurred_at) })),
      { actor_id: input.actor_id, correlation_id: input.correlation_id }
    )
);

export const resolveShipmentExceptionStep = wrapStep(
  "fulfillment-resolve-exception",
  (
    input: {
      exception_id: string;
      resolution: "REDELIVER" | "REFUND" | "RESTOCK" | "CLOSE";
      note: string;
      actor_id: string;
      correlation_id?: string | null;
    },
    c
  ) => svc(c).resolveShipmentException(input)
);

/**
 * Replaces a parcel that is no longer live: frees the fulfillment's slot and
 * creates a new shipment from the same request under a new merchant
 * reference (FR-FUL-003). The old row is kept for the audit trail.
 */
export const replaceCarrierShipmentStep = wrapStep(
  "fulfillment-replace-shipment",
  async (
    input: {
      shipment_id: string;
      reason: string;
      actor_id: string;
      correlation_id?: string | null;
    },
    c
  ) => {
    const old = await svc(c).supersedeShipment(input);
    const request = {
      ...(old.request as unknown as CreateCarrierShipmentInput["request"]),
      merchant_reference: old.next_merchant_reference,
    };
    const created = await createCarrierShipment(
      svc(c),
      getCarrierProvider(old.shipment.carrier_code),
      {
        actor_id: input.actor_id,
        correlation_id: input.correlation_id,
        order_id: old.shipment.order_id,
        medusa_fulfillment_id: old.shipment.medusa_fulfillment_id,
        return_id: old.shipment.return_id,
        exchange_return_id: old.shipment.exchange_return_id,
        request,
      }
    );
    await svc(c).linkReplacement({
      shipment_id: input.shipment_id,
      replaced_by_id: created.id,
    });
    return { replaced: input.shipment_id, shipment: created };
  }
);
