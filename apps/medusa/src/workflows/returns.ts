import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { recordAuditStep } from "./steps/fashion-audit";
import {
  authorizeReturnStep,
  closeReturnStep,
  createReturnShipmentStep,
  inspectAndPostStep,
  receiveReturnStep,
  refundReturnStep,
  rejectReturnStep,
  requestReturnStep,
  reserveExchangeStep,
} from "./steps/returns";

export const requestReturnWorkflow = createWorkflow(
  "returns-request-workflow",
  function (input: Parameters<typeof requestReturnStep>[0]) {
    return new WorkflowResponse(requestReturnStep(input));
  }
);

type AuthorizeInput = {
  actor_id: string;
  correlation_id?: string | null;
  idempotency_key: string;
  return_id: string;
  override_reason?: string | null;
  /** When set (and carrier is enabled) a return shipment is created. */
  pickup_address?: Parameters<
    typeof createReturnShipmentStep
  >[0]["pickup_address"];
  /** For exchanges: FG location to reserve the replacement SKU from. */
  exchange_location_id?: string | null;
};

/**
 * Authorize (audited; ineligible returns need an override reason), then create
 * the carrier return shipment and reserve the replacement for exchanges.
 */
export const authorizeReturnWorkflow = createWorkflow(
  "returns-authorize-workflow",
  function (input: AuthorizeInput) {
    const result = authorizeReturnStep(input);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: "returns.authorize",
      resource_type: "return_authorization",
      resource_id: input.return_id,
      reason: input.override_reason ?? null,
      after: { overridden: result.overridden },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);

    when(input, (d) => Boolean(d.pickup_address)).then(() => {
      const shipmentInput = transform({ input }, ({ input }) => ({
        actor_id: input.actor_id,
        correlation_id: input.correlation_id ?? null,
        return_id: input.return_id,
        pickup_address: input.pickup_address as NonNullable<
          AuthorizeInput["pickup_address"]
        >,
      }));
      createReturnShipmentStep(shipmentInput);
    });
    when(input, (d) => Boolean(d.exchange_location_id)).then(() => {
      const exchangeInput = transform({ input }, ({ input }) => ({
        actor_id: input.actor_id,
        correlation_id: input.correlation_id ?? null,
        idempotency_key: input.idempotency_key,
        return_id: input.return_id,
        location_id: input.exchange_location_id as string,
      }));
      reserveExchangeStep(exchangeInput);
    });
    return new WorkflowResponse(result);
  }
);

export const rejectReturnWorkflow = createWorkflow(
  "returns-reject-workflow",
  function (input: Parameters<typeof rejectReturnStep>[0]) {
    return new WorkflowResponse(rejectReturnStep(input));
  }
);

export const createReturnShipmentWorkflow = createWorkflow(
  "returns-create-shipment-workflow",
  function (input: Parameters<typeof createReturnShipmentStep>[0]) {
    return new WorkflowResponse(createReturnShipmentStep(input));
  }
);

export const reserveExchangeWorkflow = createWorkflow(
  "returns-reserve-exchange-workflow",
  function (input: Parameters<typeof reserveExchangeStep>[0]) {
    return new WorkflowResponse(reserveExchangeStep(input));
  }
);

export const receiveReturnWorkflow = createWorkflow(
  "returns-receive-workflow",
  function (input: Parameters<typeof receiveReturnStep>[0]) {
    return new WorkflowResponse(receiveReturnStep(input));
  }
);

export const inspectReturnItemWorkflow = createWorkflow(
  "returns-inspect-item-workflow",
  function (input: Parameters<typeof inspectAndPostStep>[0]) {
    return new WorkflowResponse(inspectAndPostStep(input));
  }
);

export const refundReturnWorkflow = createWorkflow(
  "returns-refund-workflow",
  function (input: Parameters<typeof refundReturnStep>[0]) {
    const result = refundReturnStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "returns.refund",
      resource_type: "return_authorization",
      resource_id: input.return_id,
      after: { payment_id: input.payment_id, amount: input.amount ?? null },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const closeReturnWorkflow = createWorkflow(
  "returns-close-workflow",
  function (input: Parameters<typeof closeReturnStep>[0]) {
    return new WorkflowResponse(closeReturnStep(input));
  }
);
