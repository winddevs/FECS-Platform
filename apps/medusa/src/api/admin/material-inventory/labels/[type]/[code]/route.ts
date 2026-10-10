import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { renderLabelSvg } from "../../../../../../lib/labels/code128";

/**
 * Printable barcode label (SVG, Code 128) for a roll or a warehouse location
 * (FR-INV-012). The barcode value is the roll or location code a scanner will
 * send back to /admin/material-inventory/scan/:code.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { type, code } = req.params;
  let headline: string[] = [];
  if (type === "roll") {
    const { data } = await query.graph({
      entity: "material_roll",
      fields: ["roll_code", "initial_qty", "material_id", "lot_id"],
      filters: { roll_code: code },
    });
    const roll = data[0];
    if (!roll) {
      res.status(404).json({
        code: "NOT_FOUND",
        type: "not_found",
        message: "Roll not found",
      });
      return;
    }
    const [{ data: materials }, { data: lots }] = await Promise.all([
      query.graph({
        entity: "material",
        fields: ["code", "name", "uom"],
        filters: { id: roll.material_id },
      }),
      query.graph({
        entity: "material_lot",
        fields: ["lot_no", "dye_lot_no"],
        filters: { id: roll.lot_id },
      }),
    ]);
    headline = [
      `${materials[0]?.code ?? ""} ${materials[0]?.name ?? ""}`.trim(),
      `Lot ${lots[0]?.lot_no ?? "-"}  Dye ${lots[0]?.dye_lot_no || "-"}`,
      `${roll.initial_qty} ${materials[0]?.uom ?? ""}`.trim(),
    ];
  } else if (type === "location") {
    const { data } = await query.graph({
      entity: "material_location",
      fields: ["code", "name", "warehouse_code", "kind"],
      filters: { code },
    });
    const location = data[0];
    if (!location) {
      res.status(404).json({
        code: "NOT_FOUND",
        type: "not_found",
        message: "Location not found",
      });
      return;
    }
    headline = [location.name, `${location.warehouse_code} / ${location.kind}`];
  } else {
    res.status(400).json({
      code: "INVALID_STATE",
      type: "invalid_data",
      message: "Label type must be roll or location",
    });
    return;
  }
  res
    .status(200)
    .setHeader("content-type", "image/svg+xml; charset=utf-8")
    .setHeader("cache-control", "no-store")
    .send(renderLabelSvg(code, { headline }));
}
