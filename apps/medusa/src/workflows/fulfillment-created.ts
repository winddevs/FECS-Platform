import {
  createWorkflow,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import {
  createShipmentForFulfillmentStep,
  shipFinishedGoodsForFulfillmentStep,
  type FulfillmentCreatedInput,
} from "./steps/fulfillment-created";

type Input = FulfillmentCreatedInput & {
  ship_finished_goods: boolean;
  create_carrier_shipment: boolean;
};

/**
 * Reaction to `order.fulfillment_created`. Each side effect is switched by an
 * independent feature flag (decided by the subscriber) so they can be rolled
 * out and rolled back separately.
 */
export const onFulfillmentCreatedWorkflow = createWorkflow(
  "on-fulfillment-created-workflow",
  function (input: Input) {
    const fg = when(input, (d) => d.ship_finished_goods).then(() =>
      shipFinishedGoodsForFulfillmentStep(input)
    );
    const shipment = when(input, (d) => d.create_carrier_shipment).then(() =>
      createShipmentForFulfillmentStep(input)
    );
    return new WorkflowResponse({ fg, shipment });
  }
);
