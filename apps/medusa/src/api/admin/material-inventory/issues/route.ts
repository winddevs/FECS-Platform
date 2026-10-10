import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { issueMaterialWorkflow } from "../../../../workflows/material-inventory";
import type { IssueMaterialBody } from "../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<IssueMaterialBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await issueMaterialWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
