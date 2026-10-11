import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { createFgLocationWorkflow } from "../../../../workflows/fashion-master-data";
import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("fg_location", "locations", [
  "warehouse_code",
  "kind",
] as const);

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { result } = await createFgLocationWorkflow(req.scope).run({
    input: req.validatedBody as never,
  });
  res.status(201).json({ location: result });
}
