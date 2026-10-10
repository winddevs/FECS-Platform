import { MedusaError } from "@medusajs/framework/utils";
import { generateEntityId } from "@medusajs/framework/utils";

import { hashPayload, safeTable, type SqlExecutor } from "../sql";

export type IdempotencyBegin<TResponse> =
  | { replay: false; recordId: string }
  | { replay: true; response: TResponse };

type ExistingRow = {
  id: string;
  request_hash: string;
  response: unknown;
};

/**
 * Claims an idempotency key inside the caller's transaction.
 *
 * - First caller inserts the record and proceeds.
 * - A concurrent duplicate blocks on the unique index until the first
 *   transaction commits, then sees the stored response and replays it.
 * - Re-using a key with a different payload is rejected.
 */
export const beginIdempotent = async <TResponse>(
  executor: SqlExecutor,
  tableName: string,
  scope: string,
  key: string,
  payload: unknown
): Promise<IdempotencyBegin<TResponse>> => {
  const table = safeTable(tableName);
  const requestHash = hashPayload(payload);
  const recordId = generateEntityId(undefined, "idem");

  const inserted = await executor.execute<{ id: string }>(
    `INSERT INTO ${table} (id, scope, idempotency_key, request_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, now(), now())
     ON CONFLICT (scope, idempotency_key) WHERE deleted_at IS NULL DO NOTHING
     RETURNING id`,
    [recordId, scope, key, requestHash]
  );

  if (inserted.length > 0) {
    return { replay: false, recordId };
  }

  const [existing] = await executor.execute<ExistingRow>(
    `SELECT id, request_hash, response FROM ${table}
     WHERE scope = ? AND idempotency_key = ? AND deleted_at IS NULL`,
    [scope, key]
  );

  if (!existing) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Idempotency record vanished for ${scope}/${key}`
    );
  }
  if (existing.request_hash !== requestHash) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      `IDEMPOTENCY_KEY_REUSED: key "${key}" was already used with a different payload`
    );
  }
  return { replay: true, response: existing.response as TResponse };
};

export const completeIdempotent = async (
  executor: SqlExecutor,
  tableName: string,
  recordId: string,
  response: unknown
): Promise<void> => {
  await executor.execute(
    `UPDATE ${safeTable(tableName)} SET response = ?::jsonb, updated_at = now() WHERE id = ?`,
    [JSON.stringify(response ?? null), recordId]
  );
};
