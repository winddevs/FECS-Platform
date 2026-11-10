import type { Access, FieldAccess, PayloadRequest } from "payload";

/**
 * True only for a request that comes from the Medusa backend.
 *
 * The `?is_from_medusa` query flag is set by the caller, so on its own it
 * proves nothing: anyone could add it to a URL. Medusa authenticates with the
 * API key of a CMS admin user (`Authorization: users API-Key <key>`, see
 * `PAYLOAD_API_KEY` and `scripts/deploy.sh seed-cms`), so a genuine request has
 * an admin `req.user` as well as the flag.
 */
export const isMedusaRequestFrom = (
  req: Partial<Pick<PayloadRequest, "query" | "user">>
): boolean =>
  Boolean(req.query?.is_from_medusa) &&
  Boolean(req.user?.roles?.includes("admin"));

export const isMedusaRequest: Access = ({ req }) => isMedusaRequestFrom(req);

export const isMedusaRequestFieldLevel: FieldAccess = ({ req }) =>
  isMedusaRequestFrom(req);
