import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { MANUFACTURING_MODULE } from "../../../../../modules/manufacturing";
import type ManufacturingModuleService from "../../../../../modules/manufacturing/service";

/** Effective capacity, same-day load and utilisation per work center. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const raw =
    typeof req.query.date === "string" ? new Date(req.query.date) : new Date();
  const day = Number.isNaN(raw.getTime()) ? new Date() : raw;
  const mfg =
    req.scope.resolve<ManufacturingModuleService>(MANUFACTURING_MODULE);
  res.json({
    date: day.toISOString().slice(0, 10),
    work_centers: await mfg.workCenterLoad(day),
  });
}
