import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { readSetting } from "../../lib/config/settings";
import { MATERIAL_INVENTORY_MODULE } from "../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../modules/materialInventory/service";
import type { ReceiveMaterialInput } from "../../modules/materialInventory/types";
import { PROCUREMENT_MODULE } from "../../modules/procurement";
import type ProcurementModuleService from "../../modules/procurement/service";
import type {
  CreatePurchaseOrderInput,
  PostedGoodsReceipt,
  PostGoodsReceiptInput,
  TransitionPurchaseOrderInput,
} from "../../modules/procurement/types";

type Resolver = { resolve: <T>(key: string) => T };
const procurement = (c: Resolver) =>
  c.resolve<ProcurementModuleService>(PROCUREMENT_MODULE);
const inventory = (c: Resolver) =>
  c.resolve<MaterialInventoryModuleService>(MATERIAL_INVENTORY_MODULE);

export const createPurchaseOrderStep = createStep(
  "procurement-create-purchase-order",
  async (input: CreatePurchaseOrderInput, { container }) => {
    // Lines that do not set their own tolerance get the configured default.
    const fallback = await readSetting(
      container,
      "procurement.default_over_receipt_pct"
    );
    return new StepResponse(
      await procurement(container).createPurchaseOrderWithLines({
        ...input,
        lines: input.lines.map((line) => ({
          ...line,
          over_receipt_pct: line.over_receipt_pct ?? fallback,
        })),
      })
    );
  }
);

export const transitionPurchaseOrderStep = createStep(
  "procurement-transition-purchase-order",
  async (input: TransitionPurchaseOrderInput, { container }) =>
    new StepResponse(
      await procurement(container).transitionPurchaseOrder(input)
    )
);

/** Records the receipt; compensation voids it if inventory posting fails. */
/**
 * Decides the fate of a receipt that is still PENDING_INVENTORY. Stock is the
 * part that cannot be undone here, so the ledger decides:
 * - stock was already posted -> roll the receipt forward to POSTED (voiding it
 *   would roll the PO back while the stock stays);
 * - nothing was posted -> void it and restore the PO quantities.
 */
export const settlePendingReceipt = async (
  c: Resolver,
  receiptId: string
): Promise<"POSTED" | "VOID"> => {
  const posted = await inventory(c).listMaterialStockMovements(
    { reference_type: "GOODS_RECEIPT", reference_id: receiptId },
    { take: 1 }
  );
  if (posted.length > 0) {
    await procurement(c).markGoodsReceiptPosted(receiptId);
    return "POSTED";
  }
  await procurement(c).voidGoodsReceipt(receiptId);
  return "VOID";
};

export const postGoodsReceiptStep = createStep(
  "procurement-post-goods-receipt",
  async (input: PostGoodsReceiptInput, { container }) => {
    // Refuse a receipt that inventory would reject BEFORE it is created.
    const poLines = await procurement(container).listPurchaseOrderLines({
      id: input.lines.map((l) => l.purchase_order_line_id),
    });
    const materialByLine = new Map(poLines.map((l) => [l.id, l.material_id]));
    await inventory(container).validateReceipt({
      location_id: input.location_id,
      lines: input.lines.flatMap((line) => {
        const material_id = materialByLine.get(line.purchase_order_line_id);
        return material_id
          ? [
              {
                material_id,
                dye_lot_no: line.dye_lot_no ?? null,
                has_rolls: Boolean(line.rolls?.length),
              },
            ]
          : [];
      }),
    });
    const receipt = await procurement(container).postGoodsReceipt(input);
    return new StepResponse(receipt, receipt.receipt.id);
  },
  async (receiptId, { container }) => {
    if (receiptId) {
      await settlePendingReceipt(container, receiptId);
    }
  }
);

type ReceiveReceiptInput = {
  receipt: PostedGoodsReceipt;
  actor_id: string;
  correlation_id?: string | null;
};

/**
 * Posts every receipt line into Material Inventory in one transaction.
 * Idempotency keys derive from the receipt line so a retry is a no-op.
 */
export const receiveReceiptIntoInventoryStep = createStep(
  "procurement-receive-into-inventory",
  async (
    { receipt, actor_id, correlation_id }: ReceiveReceiptInput,
    { container }
  ) => {
    const inputs: ReceiveMaterialInput[] = receipt.lines.map((line) => ({
      actor_id,
      correlation_id,
      idempotency_key: `grn:${receipt.receipt.id}:${line.id}`,
      material_id: line.material_id,
      location_id: receipt.location_id,
      bucket: line.bucket,
      lot: {
        lot_no: line.lot_no,
        dye_lot_no: line.dye_lot_no,
        supplier_id: receipt.supplier_id,
        source_type: "GOODS_RECEIPT",
        source_id: receipt.receipt.id,
      },
      ...(line.rolls?.length ? { rolls: line.rolls } : { qty: line.qty }),
      reference_type: "GOODS_RECEIPT",
      reference_id: receipt.receipt.id,
    }));
    return new StepResponse(
      await inventory(container).receiveMaterialBatch(inputs)
    );
  }
);

export const markGoodsReceiptPostedStep = createStep(
  "procurement-mark-receipt-posted",
  async (goodsReceiptId: string, { container }) =>
    new StepResponse(
      await procurement(container).markGoodsReceiptPosted(goodsReceiptId)
    )
);
