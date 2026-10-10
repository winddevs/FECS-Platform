import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { receiveMaterialWorkflow } from "../../../../workflows/material-inventory";
import type { ReceiveMaterialBody } from "../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<ReceiveMaterialBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await receiveMaterialWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
