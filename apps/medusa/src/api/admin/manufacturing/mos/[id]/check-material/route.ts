import { checkMaterialWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(checkMaterialWorkflow, {
  extra: (req) => ({ mo_id: req.params.id }),
  withoutIdempotencyKey: true,
});
