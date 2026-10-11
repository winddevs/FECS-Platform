import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { ANALYTICS_MARTS } from "../../../../lib/analytics/marts";

type Knex = {
  transaction: <T>(fn: (trx: KnexTrx) => Promise<T>) => Promise<T>;
};
type KnexTrx = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: unknown[] }>;
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Rows of one mart. The name is checked against the list of marts (it is
 * never interpolated from input) and the query runs in a read-only
 * transaction, so analytics can never change transactional state.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const mart = req.params.mart;
  if (!ANALYTICS_MARTS.includes(mart)) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Unknown mart",
    });
    return;
  }
  const limit = Math.min(
    Math.max(Number(req.query.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
  const db = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const rows = await db.transaction(async (trx) => {
    await trx.raw("SET TRANSACTION READ ONLY");
    const result = await trx.raw(
      `SELECT * FROM analytics.${mart} ORDER BY 1 DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return result.rows;
  });
  res.json({ mart, rows, limit, offset });
}
