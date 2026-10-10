import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { commandOf } from "../../../../lib/http/request-context";
import { requestReturnWorkflow } from "../../../../workflows/returns";

/** The customer's own returns. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "return_authorization",
    fields: [
      "id",
      "rma_no",
      "order_id",
      "type",
      "status",
      "refund_status",
      "created_at",
    ],
    filters: { customer_id: req.auth_context.actor_id },
    pagination: { take: 50, order: { created_at: "DESC" } },
  });
  res.json({ returns: data });
}

/** Customer-initiated return: ownership of the order is enforced in the workflow query. */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { result } = await requestReturnWorkflow(req.scope).run({
    input: {
      ...(req.validatedBody as object),
      ...commandOf(req),
      customer_id: req.auth_context.actor_id,
    } as never,
  });
  res.status(201).json(result);
}
