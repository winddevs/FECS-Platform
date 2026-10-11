import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { ANALYTICS_MARTS } from "../../../lib/analytics/marts";

/** The marts that analytics tools and dashboards can read (section 27). */
export async function GET(
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  res.json({ marts: ANALYTICS_MARTS });
}
