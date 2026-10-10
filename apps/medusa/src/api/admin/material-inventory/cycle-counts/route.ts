import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { cycleCountWorkflow } from "../../../../workflows/material-inventory";
import { listHandler } from "../../../fashion/list-handler";
import type { CycleCountBody } from "../../../fashion/schemas";

export const GET = listHandler("material_cycle_count", "cycle_counts", [
  "balance_id",
  "material_id",
  "status",
] as const);

/** Records a count. The adjustment is posted when someone else approves it. */
export async function POST(
  req: AuthenticatedMedusaRequest<CycleCountBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await cycleCountWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
