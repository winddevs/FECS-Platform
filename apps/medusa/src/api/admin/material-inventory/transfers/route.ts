import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { transferStockWorkflow } from "../../../../workflows/material-inventory";
import type { TransferStockBody } from "../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<TransferStockBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await transferStockWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
