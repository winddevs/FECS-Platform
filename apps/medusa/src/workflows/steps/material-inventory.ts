import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { MATERIAL_INVENTORY_MODULE } from "../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../modules/materialInventory/service";
import type {
  AdjustStockInput,
  CloseTransferInput,
  CycleCountInput,
  DecideCycleCountInput,
  DispatchTransferInput,
  IssueMaterialInput,
  QcDecisionInput,
  ReceiveMaterialInput,
  ReleaseReservationInput,
  ReserveMaterialInput,
  ReturnMaterialInput,
  ScrapMaterialInput,
  TransferStockInput,
} from "../../modules/materialInventory/types";

const resolveService = (container: {
  resolve: <T>(key: string) => T;
}): MaterialInventoryModuleService =>
  container.resolve<MaterialInventoryModuleService>(MATERIAL_INVENTORY_MODULE);

export const receiveMaterialStep = createStep(
  "material-inventory-receive",
  async (input: ReceiveMaterialInput, { container }) =>
    new StepResponse(await resolveService(container).receiveMaterial(input))
);

export const receiveMaterialBatchStep = createStep(
  "material-inventory-receive-batch",
  async (input: ReceiveMaterialInput[], { container }) =>
    new StepResponse(
      await resolveService(container).receiveMaterialBatch(input)
    )
);

export const decideQcHoldStep = createStep(
  "material-inventory-qc-decision",
  async (input: QcDecisionInput, { container }) =>
    new StepResponse(await resolveService(container).decideQcHold(input))
);

/**
 * Reserve is the one inventory mutation that is safely reversible: on a later
 * workflow failure the reservation is released with a derived idempotency key.
 */
export const reserveMaterialStep = createStep(
  "material-inventory-reserve",
  async (input: ReserveMaterialInput, { container }) => {
    const result = await resolveService(container).reserveMaterial(input);
    return new StepResponse(result, {
      reservation_id: result.reservation.id,
      idempotency_key: input.idempotency_key,
      actor_id: input.actor_id,
      correlation_id: input.correlation_id ?? null,
    });
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return;
    }
    await resolveService(container).releaseReservation({
      idempotency_key: `${compensation.idempotency_key}:compensate`,
      reservation_id: compensation.reservation_id,
      actor_id: compensation.actor_id,
      correlation_id: compensation.correlation_id,
      reason: "workflow compensation",
    });
  }
);

export const releaseReservationStep = createStep(
  "material-inventory-release-reservation",
  async (input: ReleaseReservationInput, { container }) =>
    new StepResponse(await resolveService(container).releaseReservation(input))
);

export const issueMaterialStep = createStep(
  "material-inventory-issue",
  async (input: IssueMaterialInput, { container }) =>
    new StepResponse(await resolveService(container).issueMaterial(input))
);

export const returnMaterialStep = createStep(
  "material-inventory-return",
  async (input: ReturnMaterialInput, { container }) =>
    new StepResponse(await resolveService(container).returnMaterial(input))
);

export const scrapMaterialStep = createStep(
  "material-inventory-scrap",
  async (input: ScrapMaterialInput, { container }) =>
    new StepResponse(await resolveService(container).scrapMaterial(input))
);

export const adjustStockStep = createStep(
  "material-inventory-adjust",
  async (input: AdjustStockInput, { container }) =>
    new StepResponse(await resolveService(container).adjustStock(input))
);

export const recordCycleCountStep = createStep(
  "material-inventory-cycle-count",
  async (input: CycleCountInput, { container }) =>
    new StepResponse(await resolveService(container).recordCycleCount(input))
);

export const transferStockStep = createStep(
  "material-inventory-transfer",
  async (input: TransferStockInput, { container }) =>
    new StepResponse(await resolveService(container).transferStock(input))
);
export const decideCycleCountStep = createStep(
  "material-inventory-cycle-count-decision",
  async (input: DecideCycleCountInput, { container }) =>
    new StepResponse(await resolveService(container).decideCycleCount(input))
);
export const dispatchTransferStep = createStep(
  "material-inventory-transfer-dispatch",
  async (input: DispatchTransferInput, { container }) =>
    new StepResponse(await resolveService(container).dispatchTransfer(input))
);
export const receiveTransferStep = createStep(
  "material-inventory-transfer-receive",
  async (input: CloseTransferInput, { container }) =>
    new StepResponse(await resolveService(container).receiveTransfer(input))
);
export const cancelTransferStep = createStep(
  "material-inventory-transfer-cancel",
  async (input: CloseTransferInput, { container }) =>
    new StepResponse(await resolveService(container).cancelTransfer(input))
);
