import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import type {
  ProjectionEvent,
  ReceiveFgInput,
} from "../modules/finishedGoods/service";
import type { PackBundleInput } from "../modules/manufacturing/types";
import { recordAuditStep } from "./steps/fashion-audit";
import {
  adjustFgStep,
  allocateFgStep,
  cancelFgTransferStep,
  changeFgHoldStep,
  checkPackDestinationStep,
  dispatchFgTransferStep,
  receiveFgTransferStep,
  receiveFinishedGoodsStep,
  receivePackedOutputStep,
  releaseFgAllocationStep,
  republishProjectionStep,
  setSafetyStockStep,
  shipFgStep,
  syncSellableToMedusaStep,
} from "./steps/finished-goods";
import { packBundleStep } from "./steps/manufacturing";

/** Pack QC-released output, then post it as finished goods (BR-003). */
export const packAndReceiveFinishedGoodsWorkflow = createWorkflow(
  "fg-pack-and-receive-workflow",
  function (input: PackBundleInput & { location_id: string }) {
    checkPackDestinationStep(input);
    const packed = packBundleStep(input);
    const receiveInput = transform({ input, packed }, ({ input, packed }) => ({
      packed,
      location_id: input.location_id,
      actor_id: input.actor_id,
      correlation_id: input.correlation_id ?? null,
      idempotency_key: input.idempotency_key,
    }));
    const received = receivePackedOutputStep(receiveInput);
    return new WorkflowResponse(
      transform({ packed, received }, (d) => ({
        packing: d.packed,
        finished_goods: d.received,
      }))
    );
  }
);

export const receiveFinishedGoodsWorkflow = createWorkflow(
  "fg-receive-workflow",
  function (input: ReceiveFgInput) {
    return new WorkflowResponse(receiveFinishedGoodsStep(input));
  }
);

export const changeFgHoldWorkflow = createWorkflow(
  "fg-hold-workflow",
  function (input: Parameters<typeof changeFgHoldStep>[0]) {
    return new WorkflowResponse(changeFgHoldStep(input));
  }
);

export const adjustFinishedGoodsWorkflow = createWorkflow(
  "fg-adjust-workflow",
  function (input: Parameters<typeof adjustFgStep>[0]) {
    const result = adjustFgStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "finished_goods.adjust",
      resource_type: "fg_balance",
      resource_id: `${input.sku}@${input.location_id}`,
      reason: input.reason,
      after: { direction: input.direction, qty: input.qty },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const setSafetyStockWorkflow = createWorkflow(
  "fg-safety-stock-workflow",
  function (input: Parameters<typeof setSafetyStockStep>[0]) {
    return new WorkflowResponse(setSafetyStockStep(input));
  }
);

export const allocateFgToOrderWorkflow = createWorkflow(
  "fg-allocate-workflow",
  function (input: Parameters<typeof allocateFgStep>[0]) {
    return new WorkflowResponse(allocateFgStep(input));
  }
);

export const releaseFgAllocationWorkflow = createWorkflow(
  "fg-release-allocation-workflow",
  function (input: Parameters<typeof releaseFgAllocationStep>[0]) {
    return new WorkflowResponse(releaseFgAllocationStep(input));
  }
);

export const shipFinishedGoodsWorkflow = createWorkflow(
  "fg-ship-workflow",
  function (input: Parameters<typeof shipFgStep>[0]) {
    return new WorkflowResponse(shipFgStep(input));
  }
);

export const republishProjectionWorkflow = createWorkflow(
  "fg-republish-projection-workflow",
  function (input: Parameters<typeof republishProjectionStep>[0]) {
    return new WorkflowResponse(republishProjectionStep(input));
  }
);

export const syncSellableToMedusaWorkflow = createWorkflow(
  "fg-sync-sellable-workflow",
  function (input: ProjectionEvent) {
    return new WorkflowResponse(syncSellableToMedusaStep(input));
  }
);

export const dispatchFgTransferWorkflow = createWorkflow(
  "fg-transfer-dispatch-workflow",
  function (input: Parameters<typeof dispatchFgTransferStep>[0]) {
    const result = dispatchFgTransferStep(input);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: "finished_goods.transfer.dispatch",
      resource_type: "fg_transfer",
      resource_id: result.transfer_id,
      reason: input.notes ?? null,
      after: {
        sku: input.sku,
        qty: input.qty,
        from: input.from_location_id,
        to: input.to_location_id,
      },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);
export const receiveFgTransferWorkflow = createWorkflow(
  "fg-transfer-receive-workflow",
  function (input: Parameters<typeof receiveFgTransferStep>[0]) {
    return new WorkflowResponse(receiveFgTransferStep(input));
  }
);
export const cancelFgTransferWorkflow = createWorkflow(
  "fg-transfer-cancel-workflow",
  function (input: Parameters<typeof cancelFgTransferStep>[0]) {
    const result = cancelFgTransferStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "finished_goods.transfer.cancel",
      resource_type: "fg_transfer",
      resource_id: input.transfer_id,
      reason: input.reason ?? null,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);
