import { republishProjectionWorkflow } from "../../../../../workflows/finished-goods";
import { commandRoute } from "../../../../fashion/command-route";

export const POST = commandRoute(republishProjectionWorkflow, {
  withoutIdempotencyKey: true,
});
