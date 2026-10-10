import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { FINISHED_GOODS_MODULE } from "../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../modules/finishedGoods/service";
import { MATERIAL_INVENTORY_MODULE } from "../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../modules/materialInventory/service";
import { PROCUREMENT_MODULE } from "../../modules/procurement";
import type ProcurementModuleService from "../../modules/procurement/service";

/** Generated create methods are overloaded; pick the element type of the array form. */
type ElementOf<T> = T extends readonly (infer E)[] ? E : T;
type MaterialData = ElementOf<
  Parameters<MaterialInventoryModuleService["createMaterials"]>[0]
>;
type LocationData = ElementOf<
  Parameters<MaterialInventoryModuleService["createMaterialLocations"]>[0]
>;
type SupplierData = ElementOf<
  Parameters<ProcurementModuleService["createSuppliers"]>[0]
>;

const inventory = (c: { resolve: <T>(k: string) => T }) =>
  c.resolve<MaterialInventoryModuleService>(MATERIAL_INVENTORY_MODULE);
const procurement = (c: { resolve: <T>(k: string) => T }) =>
  c.resolve<ProcurementModuleService>(PROCUREMENT_MODULE);

export const createMaterialStep = createStep(
  "fashion-create-material",
  async (input: MaterialData, { container }) => {
    const material = await inventory(container).createMaterials(input);
    return new StepResponse(material, material.id);
  },
  async (id, { container }) => {
    if (id) {
      await inventory(container).deleteMaterials(id);
    }
  }
);

export const updateMaterialStep = createStep(
  "fashion-update-material",
  async (input: { id: string } & Record<string, unknown>, { container }) => {
    const service = inventory(container);
    const previous = await service.retrieveMaterial(input.id);
    const updated = await service.updateMaterials(input as never);
    return new StepResponse(updated, previous);
  },
  async (previous, { container }) => {
    if (previous) {
      await inventory(container).updateMaterials(previous as never);
    }
  }
);

export const createMaterialLocationStep = createStep(
  "fashion-create-material-location",
  async (input: LocationData, { container }) => {
    const location = await inventory(container).createMaterialLocations(input);
    return new StepResponse(location, location.id);
  },
  async (id, { container }) => {
    if (id) {
      await inventory(container).deleteMaterialLocations(id);
    }
  }
);

export const updateMaterialLocationStep = createStep(
  "fashion-update-material-location",
  async (input: { id: string } & Record<string, unknown>, { container }) => {
    const service = inventory(container);
    const previous = await service.retrieveMaterialLocation(input.id);
    const updated = await service.updateMaterialLocations(input as never);
    return new StepResponse(updated, previous);
  },
  async (previous, { container }) => {
    if (previous) {
      await inventory(container).updateMaterialLocations(previous as never);
    }
  }
);

export const createSupplierStep = createStep(
  "fashion-create-supplier",
  async (input: SupplierData, { container }) => {
    const supplier = await procurement(container).createSuppliers(input);
    return new StepResponse(supplier, supplier.id);
  },
  async (id, { container }) => {
    if (id) {
      await procurement(container).deleteSuppliers(id);
    }
  }
);

export const updateSupplierStep = createStep(
  "fashion-update-supplier",
  async (input: { id: string } & Record<string, unknown>, { container }) => {
    const service = procurement(container);
    const previous = await service.retrieveSupplier(input.id);
    const updated = await service.updateSuppliers(input as never);
    return new StepResponse(updated, previous);
  },
  async (previous, { container }) => {
    if (previous) {
      await procurement(container).updateSuppliers(previous as never);
    }
  }
);

type FgLocationData = ElementOf<
  Parameters<FinishedGoodsModuleService["createFgLocations"]>[0]
>;

export const createFgLocationStep = createStep(
  "fashion-create-fg-location",
  async (input: FgLocationData, { container }) => {
    const service = container.resolve<FinishedGoodsModuleService>(
      FINISHED_GOODS_MODULE
    );
    const location = await service.createFgLocations(input);
    return new StepResponse(location, location.id);
  },
  async (id, { container }) => {
    if (id) {
      await container
        .resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE)
        .deleteFgLocations(id);
    }
  }
);
