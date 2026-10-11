import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which event caused the work that is running (NFR-OBS-003). A subscriber
 * runs its work inside `withCausation(event_id, ...)`; every event emitted by
 * that work then carries `causation_id`, so a chain of events can be walked
 * back to the webhook or order that started it.
 */
const storage = new AsyncLocalStorage<{ causation_id: string }>();

export const withCausation = <T>(
  causationId: string | null | undefined,
  fn: () => Promise<T>
): Promise<T> =>
  causationId ? storage.run({ causation_id: causationId }, fn) : fn();

export const currentCausation = (): string | null =>
  storage.getStore()?.causation_id ?? null;
