import {
  createStep,
  StepResponse,
  type StepFunction,
} from "@medusajs/framework/workflows-sdk";

export type Resolver = { resolve: <T>(key: string) => T };

/**
 * Thin step wrapper. The explicit return type keeps workflow inputs typed
 * (createStep's own inference collapses inside a generic helper).
 */
export const wrapStep = <I, O>(
  name: string,
  fn: (input: I, c: Resolver) => Promise<O>
): StepFunction<I, O> =>
  createStep(
    name,
    (async (input: unknown, { container }: { container: Resolver }) =>
      new StepResponse(await fn(input as I, container))) as never
  ) as unknown as StepFunction<I, O>;
