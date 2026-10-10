import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { sendAgentMessageWorkflow } from "../../../../../../workflows/social";
import { commandRoute } from "../../../../../fashion/command-route";

const HISTORY_LIMIT = 100;

/** The conversation, newest first, for the agent who took it over. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "conversation_message",
    fields: ["id", "direction", "text", "intent", "status", "created_at"],
    filters: { identity_id: req.params.id },
    pagination: { take: HISTORY_LIMIT, order: { created_at: "DESC" } },
  });
  res.json({ messages: data });
}

export const POST = commandRoute(sendAgentMessageWorkflow, {
  extra: (req) => ({ identity_id: req.params.id }),
  withoutIdempotencyKey: true,
});
