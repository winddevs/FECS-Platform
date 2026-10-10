import { retryProductionRequestWorkflow } from "../../../../../../workflows/mto";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(retryProductionRequestWorkflow, {
  extra: (req) => ({ request_id: req.params.id }),
  withoutIdempotencyKey: true,
});
