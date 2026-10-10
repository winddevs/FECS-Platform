import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import type {
  CreatePurchaseOrderInput,
  PostGoodsReceiptInput,
  TransitionPurchaseOrderInput,
} from "../modules/procurement/types";
import { recordAuditStep } from "./steps/fashion-audit";
import {
  createPurchaseOrderStep,
  markGoodsReceiptPostedStep,
  postGoodsReceiptStep,
  receiveReceiptIntoInventoryStep,
  transitionPurchaseOrderStep,
} from "./steps/procurement";

export const createPurchaseOrderWorkflow = createWorkflow(
  "procurement-create-purchase-order-workflow",
  function (input: CreatePurchaseOrderInput) {
    return new WorkflowResponse(createPurchaseOrderStep(input));
  }
);

export const transitionPurchaseOrderWorkflow = createWorkflow(
  "procurement-transition-purchase-order-workflow",
  function (input: TransitionPurchaseOrderInput) {
    const result = transitionPurchaseOrderStep(input);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: `procurement.purchase_order.${input.action}`,
      resource_type: "purchase_order",
      resource_id: input.purchase_order_id,
      reason: input.reason ?? null,
      before: { status: result.from },
      after: { status: result.status },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

/**
 * PO receipt -> goods receipt -> material stock (FR-PROC-003/004/005).
 * If inventory posting fails the receipt is voided (compensation) and the PO
 * quantities are restored.
 */
export const receiveGoodsWorkflow = createWorkflow(
  "procurement-receive-goods-workflow",
  function (input: PostGoodsReceiptInput) {
    const receipt = postGoodsReceiptStep(input);

    const inventoryInput = transform(
      { receipt, input },
      ({ receipt, input }) => ({
        receipt,
        actor_id: input.actor_id,
        correlation_id: input.correlation_id ?? null,
      })
    );
    receiveReceiptIntoInventoryStep(inventoryInput);

    const receiptId = transform(
      { receipt },
      ({ receipt }) => receipt.receipt.id
    );
    markGoodsReceiptPostedStep(receiptId);

    const posted = transform({ receipt }, ({ receipt }) => ({
      ...receipt,
      receipt: { ...receipt.receipt, status: "POSTED" },
    }));
    return new WorkflowResponse(posted);
  }
);
