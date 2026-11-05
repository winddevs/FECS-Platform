import "server-only";
import { createHash } from "node:crypto";

import Redis from "ioredis";
import { headers } from "next/headers";

/**
 * Fixed-window rate limiter for credential forms (sign-in, sign-up).
 *
 * With `REDIS_URL` set, counters live in Redis, so every storefront instance
 * shares them and a restart does not reset them. Without it (local dev) or
 * when Redis is unreachable, each process counts on its own in memory. That
 * fallback keeps sign-in working during a Redis outage, but then the limit is
 * per instance and resets on restart, so alert on the warning it logs.
 *
 * This is the per-account layer. The per-address layer for direct calls to the
 * Medusa API is nginx (`infra/nginx/bibaestudios.com.conf`, zone
 * `customer_auth`).
 */

type Bucket = { count: number; resetAt: number };

const MAX_MEMORY_BUCKETS = 10_000;
const KEY_PREFIX = "rl:store:";
const REDIS_TIMEOUT_MS = 500;
const WARN_EVERY_MS = 60_000;

/**
 * Atomic "count this hit, start the window on the first one". One round trip
 * and no race between INCR and PEXPIRE.
 */
const COUNT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const memoryBuckets = new Map<string, Bucket>();

const allowInMemory = (
  key: string,
  limit: number,
  windowMs: number
): boolean => {
  const now = Date.now();

  if (memoryBuckets.size > MAX_MEMORY_BUCKETS) {
    for (const [bucketKey, bucket] of memoryBuckets) {
      if (bucket.resetAt <= now) {
        memoryBuckets.delete(bucketKey);
      }
    }
  }

  const current = memoryBuckets.get(key);
  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  return current.count <= limit;
};

let redisClient: Redis | null | undefined;
let lastWarningAt = 0;

const warnOnce = (message: string, error?: unknown): void => {
  const now = Date.now();
  if (now - lastWarningAt < WARN_EVERY_MS) {
    return;
  }
  lastWarningAt = now;
  console.warn(
    `[rate-limit] ${message}`,
    error instanceof Error ? error.message : ""
  );
};

/** Lazily created; `null` when no `REDIS_URL` is configured. */
const getRedis = (): Redis | null => {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    if (process.env.NODE_ENV === "production") {
      warnOnce(
        "REDIS_URL is not set: sign-in limits are per instance and reset on restart."
      );
    }
    return redisClient;
  }

  redisClient = new Redis(url, {
    // Fail fast: a slow Redis must not make sign-in hang.
    connectTimeout: REDIS_TIMEOUT_MS,
    commandTimeout: REDIS_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  // An unhandled "error" event would crash the process.
  redisClient.on("error", (error) => warnOnce("Redis error.", error));
  return redisClient;
};

/**
 * Keys carry emails, so only a hash is sent to Redis. The same input always
 * maps to the same key; the data itself never leaves the process.
 */
const redisKey = (key: string): string =>
  `${KEY_PREFIX}${createHash("sha256").update(key).digest("hex")}`;

/**
 * Counts this attempt and returns true while it is within `limit` per
 * `windowMs`. Never throws: Redis failures fall back to the in-memory counter.
 */
export const allowRequest = async (
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> => {
  const redis = getRedis();
  if (!redis) {
    return allowInMemory(key, limit, windowMs);
  }

  try {
    const count = await redis.eval(
      COUNT_SCRIPT,
      1,
      redisKey(key),
      String(windowMs)
    );
    return Number(count) <= limit;
  } catch (error) {
    warnOnce("Redis unavailable, using per-instance counters.", error);
    return allowInMemory(key, limit, windowMs);
  }
};

/**
 * Best-effort client address. `x-forwarded-for` is only trustworthy behind
 * your own proxy (nginx overwrites it), so callers also key on the account
 * (email) to stay effective when the header is spoofed.
 */
export const clientAddress = async (): Promise<string> => {
  const requestHeaders = await headers();
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || "unknown";
};
