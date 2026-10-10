import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { reserveMaterialWorkflow } from "../../../../workflows/material-inventory";
import { listHandler } from "../../../fashion/list-handler";
import type { ReserveMaterialBody } from "../../../fashion/schemas";

export const GET = listHandler("material_reservation", "reservations", [
  "material_id",
  "reference_type",
  "reference_id",
  "status",
] as const);

export async function POST(
  req: AuthenticatedMedusaRequest<ReserveMaterialBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await reserveMaterialWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
