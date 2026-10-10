import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { renderLabelSvg } from "../../../../../../../lib/labels/code128";

/** Printable bundle ticket (Code 128) that travels with the cut pieces. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "bundle",
    fields: ["bundle_code", "sku", "qty", "mo_id"],
    filters: { bundle_code: req.params.code },
  });
  const bundle = data[0];
  if (!bundle) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Bundle not found",
    });
    return;
  }
  res
    .status(200)
    .setHeader("content-type", "image/svg+xml; charset=utf-8")
    .setHeader("cache-control", "no-store")
    .send(
      renderLabelSvg(bundle.bundle_code, {
        headline: [`${bundle.sku}`, `Qty ${bundle.qty}`],
      })
    );
}
