import { decideMrpSuggestionWorkflow } from "../../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../../fashion/command-route";

export const POST = commandRoute(decideMrpSuggestionWorkflow, {
  extra: (req) => ({ suggestion_id: req.params.id }),
  withoutIdempotencyKey: true,
});
