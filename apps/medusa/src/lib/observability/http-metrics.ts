import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

/**
 * In-process request latency histogram (NFR-OBS-002, TDD section 50). It is
 * what the SLO alerts (webhook ACK p95, availability p95, ...) are computed
 * from. Labels are kept low-cardinality on purpose: the path is reduced to a
 * route shape, so ids never become labels.
 */
export const BUCKETS_MS = [
  5, 10, 25, 50, 100, 200, 300, 500, 1000, 2500, 5000, 10_000,
] as const;
const MAX_SERIES = 500;
const MAX_SEGMENTS = 6;

type Series = { count: number; sum: number; buckets: number[] };
const series = new Map<string, Series>();

const ID_LIKE = /\d|^[a-z]+_[0-9a-z]{8,}$/i;

/** `/admin/manufacturing/mos/mo_01ABC/cut` -> `/admin/manufacturing/mos/:id/cut`. */
export const routeShape = (path: string): string =>
  path
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .slice(0, MAX_SEGMENTS)
    .map((segment) =>
      ID_LIKE.test(segment) || segment.length > 32 ? ":id" : segment
    )
    .join("/")
    .replace(/^/, "/");

/** 401/403 per route shape: a spike means credential stuffing or a broken client. */
const authFailures = new Map<string, number>();

export const observe = (
  method: string,
  path: string,
  status: number,
  ms: number
): void => {
  if (status === 401 || status === 403) {
    const failureKey = `${routeShape(path)}|${status}`;
    if (authFailures.has(failureKey) || authFailures.size < MAX_SERIES) {
      authFailures.set(failureKey, (authFailures.get(failureKey) ?? 0) + 1);
    }
  }
  let key = `${method}|${routeShape(path)}|${Math.floor(status / 100)}xx`;
  if (!series.has(key) && series.size >= MAX_SERIES) {
    key = `${method}|other|${Math.floor(status / 100)}xx`;
  }
  const entry = series.get(key) ?? {
    count: 0,
    sum: 0,
    buckets: BUCKETS_MS.map(() => 0),
  };
  entry.count += 1;
  entry.sum += ms;
  BUCKETS_MS.forEach((bound, i) => {
    if (ms <= bound) {
      entry.buckets[i] += 1;
    }
  });
  series.set(key, entry);
};

export const httpMetricsMiddleware = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): void => {
  const start = process.hrtime.bigint();
  const path = req.originalUrl ?? req.url;
  res.once("finish", () => {
    observe(
      req.method,
      path,
      res.statusCode,
      Number(process.hrtime.bigint() - start) / 1e6
    );
  });
  next();
};

export const renderHttpMetrics = (): string[] => {
  const out = ["# TYPE fashion_http_request_duration_ms histogram"];
  for (const [key, entry] of series) {
    const [method, route, status] = key.split("|");
    const labels = `method="${method}",route="${route}",status="${status}"`;
    BUCKETS_MS.forEach((bound, i) => {
      out.push(
        `fashion_http_request_duration_ms_bucket{${labels},le="${bound}"} ${entry.buckets[i]}`
      );
    });
    out.push(
      `fashion_http_request_duration_ms_bucket{${labels},le="+Inf"} ${entry.count}`,
      `fashion_http_request_duration_ms_sum{${labels}} ${entry.sum.toFixed(1)}`,
      `fashion_http_request_duration_ms_count{${labels}} ${entry.count}`
    );
  }
  out.push("# TYPE fashion_http_auth_failures_total counter");
  for (const [key, count] of authFailures) {
    const [route, status] = key.split("|");
    out.push(
      `fashion_http_auth_failures_total{route="${route}",status="${status}"} ${count}`
    );
  }
  return out;
};

export const resetHttpMetrics = (): void => {
  series.clear();
  authFailures.clear();
};
