import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { cycleCountWorkflow } from "../../../../workflows/material-inventory";
import type { CycleCountBody } from "../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<CycleCountBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await cycleCountWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
