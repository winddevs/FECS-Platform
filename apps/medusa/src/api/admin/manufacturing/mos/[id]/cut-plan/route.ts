import { createCutPlanWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(createCutPlanWorkflow, {
  status: 201,
  extra: (req) => ({ mo_id: req.params.id }),
  withoutIdempotencyKey: true,
});
