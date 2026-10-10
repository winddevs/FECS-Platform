import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { createWorkCenterWorkflow } from "../../../../workflows/manufacturing";
import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("work_center", "work_centers", [
  "type",
] as const);

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { result } = await createWorkCenterWorkflow(req.scope).run({
    input: req.validatedBody as never,
  });
  res.status(201).json({ work_center: result });
}
