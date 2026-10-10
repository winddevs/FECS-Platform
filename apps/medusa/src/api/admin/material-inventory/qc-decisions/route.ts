import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { decideQcHoldWorkflow } from "../../../../workflows/material-inventory";
import type { QcDecisionBody } from "../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<QcDecisionBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await decideQcHoldWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
