import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { transferStockWorkflow } from "../../../../workflows/material-inventory";
import { listHandler } from "../../../fashion/list-handler";
import type { TransferStockBody } from "../../../fashion/schemas";

export const GET = listHandler("material_transfer", "transfers", [
  "material_id",
  "status",
  "to_location_id",
] as const);

/** Same-site move. Between warehouses use /transfers/dispatch. */
export async function POST(
  req: AuthenticatedMedusaRequest<TransferStockBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await transferStockWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
