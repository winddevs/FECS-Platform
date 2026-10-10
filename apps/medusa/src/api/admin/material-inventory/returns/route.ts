import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { returnMaterialWorkflow } from "../../../../workflows/material-inventory";
import type { ReturnMaterialBody } from "../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<ReturnMaterialBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await returnMaterialWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
