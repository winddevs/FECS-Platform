import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { actorOf, commandOf } from "../../lib/http/request-context";

type WorkflowRunner = (scope: AuthenticatedMedusaRequest["scope"]) => {
  run: (args: { input: never }) => Promise<{ result: unknown }>;
};

/**
 * Builds a POST handler that runs a workflow with the validated body, the
 * authenticated actor, a correlation id and the required Idempotency-Key.
 * `extra` injects path params (e.g. the MO id).
 *
 * Routes stay declarative (validate -> workflow -> respond); business rules
 * live in the workflow/module, never here.
 */
export const commandRoute =
  (
    workflow: unknown,
    options: {
      status?: number;
      extra?: (req: AuthenticatedMedusaRequest) => Record<string, unknown>;
      /** Commands without an idempotency need (state is idempotent by itself). */
      withoutIdempotencyKey?: boolean;
    } = {}
  ) =>
  async (
    req: AuthenticatedMedusaRequest,
    res: MedusaResponse
  ): Promise<void> => {
    const actor = options.withoutIdempotencyKey ? actorOf(req) : commandOf(req);
    const { result } = await (workflow as WorkflowRunner)(req.scope).run({
      input: {
        ...(req.validatedBody as Record<string, unknown>),
        ...actor,
        ...options.extra?.(req),
      } as never,
    });
    res.status(options.status ?? 200).json(result);
  };
