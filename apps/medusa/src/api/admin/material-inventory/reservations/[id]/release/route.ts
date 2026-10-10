import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../../../lib/http/request-context";
import { releaseReservationWorkflow } from "../../../../../../workflows/material-inventory";
import type { ReleaseReservationBody } from "../../../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<ReleaseReservationBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await releaseReservationWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      ...commandOf(req),
      reservation_id: req.params.id,
    },
  });
  res.status(200).json(result);
}
