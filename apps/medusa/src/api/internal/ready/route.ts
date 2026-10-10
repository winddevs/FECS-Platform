import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

type Knex = { raw: (sql: string) => Promise<unknown> };

/**
 * Kubernetes readiness probe: the pod only receives traffic when it can reach
 * Postgres. Liveness stays on Medusa's built-in /health. Exposes no data.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    await req.scope
      .resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
      .raw("select 1");
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
}
