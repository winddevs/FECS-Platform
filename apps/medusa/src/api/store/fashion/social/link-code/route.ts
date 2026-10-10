import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { createLinkCodeWorkflow } from "../../../../../workflows/social";

/** One-time code the customer sends to the Messenger page to link their account. */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { result } = await createLinkCodeWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id },
  });
  res.status(201).json(result);
}
