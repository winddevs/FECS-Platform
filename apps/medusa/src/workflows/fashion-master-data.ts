import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import {
  createFgLocationStep,
  createMaterialLocationStep,
  createMaterialStep,
  createSupplierStep,
  updateMaterialLocationStep,
  updateMaterialStep,
  updateSupplierStep,
} from "./steps/fashion-master-data";

type CreateMaterialInput = Parameters<typeof createMaterialStep>[0];
type CreateLocationInput = Parameters<typeof createMaterialLocationStep>[0];
type CreateSupplierInput = Parameters<typeof createSupplierStep>[0];
type UpdateInput = { id: string } & Record<string, unknown>;

export const createMaterialWorkflow = createWorkflow(
  "fashion-create-material-workflow",
  function (input: CreateMaterialInput) {
    return new WorkflowResponse(createMaterialStep(input));
  }
);

export const updateMaterialWorkflow = createWorkflow(
  "fashion-update-material-workflow",
  function (input: UpdateInput) {
    return new WorkflowResponse(updateMaterialStep(input));
  }
);

export const createMaterialLocationWorkflow = createWorkflow(
  "fashion-create-material-location-workflow",
  function (input: CreateLocationInput) {
    return new WorkflowResponse(createMaterialLocationStep(input));
  }
);

export const updateMaterialLocationWorkflow = createWorkflow(
  "fashion-update-material-location-workflow",
  function (input: UpdateInput) {
    return new WorkflowResponse(updateMaterialLocationStep(input));
  }
);

export const createSupplierWorkflow = createWorkflow(
  "fashion-create-supplier-workflow",
  function (input: CreateSupplierInput) {
    return new WorkflowResponse(createSupplierStep(input));
  }
);

export const updateSupplierWorkflow = createWorkflow(
  "fashion-update-supplier-workflow",
  function (input: UpdateInput) {
    return new WorkflowResponse(updateSupplierStep(input));
  }
);

export const createFgLocationWorkflow = createWorkflow(
  "fashion-create-fg-location-workflow",
  function (input: Parameters<typeof createFgLocationStep>[0]) {
    return new WorkflowResponse(createFgLocationStep(input));
  }
);
