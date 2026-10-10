import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { commandOf } from "../../../../../../lib/http/request-context";
import { inspectBundleWorkflow } from "../../../../../../workflows/manufacturing";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "bundle",
    fields: ["id", "mo_id"],
    filters: { id: req.params.id },
  });
  if (!data[0]) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Bundle not found",
    });
    return;
  }
  const { result } = await inspectBundleWorkflow(req.scope).run({
    input: {
      ...(req.validatedBody as object),
      ...commandOf(req),
      bundle_id: data[0].id,
      mo_id: data[0].mo_id,
    } as never,
  });
  res.status(201).json(result);
}
