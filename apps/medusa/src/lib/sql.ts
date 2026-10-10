import { createHash } from "node:crypto";

/**
 * Minimal contract of the MikroORM entity manager that Medusa injects as
 * `sharedContext.transactionManager`. Raw SQL executed through it participates
 * in the current transaction.
 */
export type SqlExecutor = {
  execute: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<T[]>;
};

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/** Table names are interpolated into SQL, so they must be plain identifiers. */
export const safeTable = (name: string): string => {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
};

/** Deterministic hash of a request payload, used to detect key reuse. */
export const hashPayload = (payload: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(sortKeys(payload)))
    .digest("hex");
