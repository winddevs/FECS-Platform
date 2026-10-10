import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

const MAX_PAGE_SIZE = 200;

/**
 * Builds a paginated GET handler over a data-model entity. Filters come only
 * from an explicit allow-list so clients cannot probe arbitrary columns.
 */
export const listHandler =
  (entity: string, responseKey: string, filterKeys: readonly string[]) =>
  async (
    req: AuthenticatedMedusaRequest,
    res: MedusaResponse
  ): Promise<void> => {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const validated = (req.validatedQuery ?? {}) as Record<string, unknown>;

    const filters: Record<string, unknown> = {};
    for (const key of filterKeys) {
      if (validated[key] !== undefined) {
        filters[key] = validated[key];
      }
    }

    // Medusa rewrites a lone "*" default into ".*", so "all fields" is decided
    // here: honour an explicit ?fields=, otherwise return every column.
    const fields = validated.fields ? req.queryConfig.fields : ["*"];
    const pagination = req.queryConfig.pagination;
    const take = Math.min(pagination?.take ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    const { data, metadata } = await query.graph({
      entity,
      filters,
      fields,
      pagination: { ...pagination, take },
    });

    res.json({
      [responseKey]: data,
      count: metadata?.count ?? data.length,
      offset: pagination?.skip ?? 0,
      limit: take,
    });
  };

/** GET /:id helper. */
export const retrieveHandler =
  (entity: string, responseKey: string, paramName = "id", filterField = "id") =>
  async (
    req: AuthenticatedMedusaRequest,
    res: MedusaResponse
  ): Promise<void> => {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity,
      fields: ["*"],
      filters: { [filterField]: req.params[paramName] },
    });
    if (data.length === 0) {
      res.status(404).json({
        code: "NOT_FOUND",
        type: "not_found",
        message: `${entity} ${req.params[paramName]} not found`,
      });
      return;
    }
    res.json({ [responseKey]: data[0] });
  };
