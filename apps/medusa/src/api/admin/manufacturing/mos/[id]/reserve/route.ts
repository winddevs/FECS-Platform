import { reserveMoMaterialsWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(reserveMoMaterialsWorkflow, {
  extra: (req) => ({ mo_id: req.params.id }),
  withoutIdempotencyKey: true,
});
