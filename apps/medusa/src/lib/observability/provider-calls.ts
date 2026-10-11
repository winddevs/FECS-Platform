import otel from "@opentelemetry/api";

/**
 * Outbound calls to J&T, Meta and other providers: a trace span for each call
 * (NFR-OBS-001) plus count and latency per provider (NFR-OBS-002), so a
 * provider outage shows up as an error rate before customers notice.
 * External latency is kept apart from our own (requirement section 20).
 */
const BUCKETS_MS = [
  50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000,
] as const;
const MAX_SERIES = 200;

type Series = { count: number; sum: number; buckets: number[] };
const calls = new Map<string, Series>();

const tracer = otel.trace.getTracer("fashion-platform");

/** Reads a provider error kind (RETRYABLE, FINAL, AMBIGUOUS) when it has one. */
const outcomeOf = (error: unknown): string => {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return typeof kind === "string" ? kind.toLowerCase() : "error";
};

const record = (
  provider: string,
  operation: string,
  outcome: string,
  ms: number
): void => {
  let key = `${provider}|${operation}|${outcome}`;
  if (!calls.has(key) && calls.size >= MAX_SERIES) {
    key = `${provider}|other|${outcome}`;
  }
  const entry = calls.get(key) ?? {
    count: 0,
    sum: 0,
    buckets: BUCKETS_MS.map(() => 0),
  };
  entry.count += 1;
  entry.sum += ms;
  BUCKETS_MS.forEach((bound, index) => {
    if (ms <= bound) {
      entry.buckets[index] += 1;
    }
  });
  calls.set(key, entry);
};

export const observeProviderCall = <T>(
  provider: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> =>
  tracer.startActiveSpan(`${provider} ${operation}`, async (span) => {
    span.setAttribute("provider", provider);
    span.setAttribute("provider.operation", operation);
    const start = process.hrtime.bigint();
    try {
      const result = await fn();
      record(
        provider,
        operation,
        "ok",
        Number(process.hrtime.bigint() - start) / 1e6
      );
      return result;
    } catch (error) {
      const outcome = outcomeOf(error);
      span.setAttribute("provider.outcome", outcome);
      span.recordException(error as Error);
      record(
        provider,
        operation,
        outcome,
        Number(process.hrtime.bigint() - start) / 1e6
      );
      throw error;
    } finally {
      span.end();
    }
  });

export const renderProviderMetrics = (): string[] => {
  const out = ["# TYPE fashion_provider_call_duration_ms histogram"];
  for (const [key, entry] of calls) {
    const [provider, operation, outcome] = key.split("|");
    const labels = `provider="${provider}",operation="${operation}",outcome="${outcome}"`;
    BUCKETS_MS.forEach((bound, index) => {
      out.push(
        `fashion_provider_call_duration_ms_bucket{${labels},le="${bound}"} ${entry.buckets[index]}`
      );
    });
    out.push(
      `fashion_provider_call_duration_ms_bucket{${labels},le="+Inf"} ${entry.count}`,
      `fashion_provider_call_duration_ms_sum{${labels}} ${entry.sum.toFixed(1)}`,
      `fashion_provider_call_duration_ms_count{${labels}} ${entry.count}`
    );
  }
  return out;
};

export const resetProviderMetrics = (): void => calls.clear();
