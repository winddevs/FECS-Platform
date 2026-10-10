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
    const [shipment] = await svc(c).listCarrierShipments({
      id: input.shipment_id,
    });
    if (!shipment) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Shipment not found"
      );
    }
    if (shipment.tracking_number) {
      await getCarrierProvider(shipment.carrier_code).cancelShipment(
        shipment.tracking_number
      );
    }
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
