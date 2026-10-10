import { loadEnv, defineConfig } from "@medusajs/framework/utils";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";

// Load environment variables based on NODE_ENV
loadEnv(process.env.NODE_ENV || "development", process.cwd());

// Choose the appropriate database URL based on NODE_ENV
const getDatabaseUrl = () => {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  }
  return process.env.DATABASE_URL;
};

// Get Redis URL from environment variables with fallback
const getRedisUrl = () => {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return (
      process.env.LOCAL_REDIS_URL ||
      process.env.REDIS_URL ||
      "redis://localhost:6379"
    );
  }
  return process.env.REDIS_URL || "redis://redis:6379";
};

// ---------------------------------------------------------------------------
// Fashion platform modules (modular monolith: one deployable, bounded contexts,
// each owning its own tables). Extract a module into a service only when scale,
// team or security needs it - the contracts (service API + events) stay.
// ---------------------------------------------------------------------------
const fashionModules = [
  { resolve: "./src/modules/integration" },
  { resolve: "./src/modules/materialInventory" },
  { resolve: "./src/modules/procurement" },
  { resolve: "./src/modules/manufacturing" },
  { resolve: "./src/modules/quality" },
  { resolve: "./src/modules/finishedGoods" },
  { resolve: "./src/modules/fulfillment" },
  { resolve: "./src/modules/socialCommerce" },
  { resolve: "./src/modules/returns" },
];

const integer = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const httpConfig = {
  storeCors: process.env.STORE_CORS!,
  adminCors: process.env.ADMIN_CORS!,
  authCors: process.env.AUTH_CORS!,
  jwtSecret: process.env.JWT_SECRET,
  cookieSecret: process.env.COOKIE_SECRET,
};

// Integration-test profile: only core + fashion modules, in-memory workflow
// engine, no Redis / Algolia / S3 / email needed. See integration-tests/.
if (process.env.INTEGRATION_TEST === "true") {
  module.exports = defineConfig({
    modules: [
      { resolve: "@medusajs/medusa/workflow-engine-inmemory" },
      // Existing product<->Payload link needs the module registered; the stub
      // options are never used because tests never call Payload.
      {
        resolve: "./src/modules/payload",
        options: {
          serverUrl: "http://localhost:0",
          apiKey: "integration-test",
        },
      },
      ...fashionModules,
    ],
    admin: { disable: true },
    projectConfig: { databaseUrl: getDatabaseUrl(), http: httpConfig },
  });
} else {
  // MEDUSA_WORKER_MODE: "server" (HTTP only), "worker" (jobs + subscribers
  // only) or "shared" (both, the default for local dev). Production runs
  // server and worker as separate deployments so they scale independently.
  const workerMode = (process.env.MEDUSA_WORKER_MODE || "shared") as
    | "shared"
    | "worker"
    | "server";

  // Redis backs the event bus, cache and distributed locks so that several
  // server/worker replicas behave as one system. Without REDIS_URL (local dev)
  // Medusa falls back to its in-memory implementations.
  const redisUrl = getRedisUrl();
  const useRedis = Boolean(
    process.env.REDIS_URL || process.env.LOCAL_REDIS_URL
  );
  const redisInfra = useRedis
    ? [
        {
          resolve: "@medusajs/medusa/event-bus-redis",
          options: { redisUrl },
        },
        {
          resolve: "@medusajs/medusa/cache-redis",
          options: { redisUrl },
        },
        {
          resolve: "@medusajs/medusa/locking",
          options: {
            providers: [
              {
                resolve: "@medusajs/medusa/locking-redis",
                id: "locking-redis",
                is_default: true,
                options: { redisUrl },
              },
            ],
          },
        },
      ]
    : [];

  // LOCAL_STACK=true: the production topology (Redis event bus, cache,
  // locks and workflow engine, separate server/worker) with local stand-ins for
  // the SaaS pieces that cannot run on a laptop: files on disk instead of S3,
  // notifications written to the log instead of Resend, no PostHog. Used by
  // docker/docker-compose.e2e.yml. Never set it in production.
  const localStack = process.env.LOCAL_STACK === "true";

  module.exports = defineConfig({
    modules: [
      {
        resolve: "@medusajs/medusa/product",
      },
      {
        resolve: "@medusajs/medusa/auth",
        dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/auth-emailpass",
              id: "emailpass",
            },
          ],
        },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: {
          redis: {
            url: getRedisUrl(),
          },
        },
      },
      {
        resolve: "./src/modules/payload",
        options: {
          serverUrl: process.env.PAYLOAD_SERVER_URL,
          apiKey: process.env.PAYLOAD_API_KEY,
          userCollection: process.env.PAYLOAD_USER_COLLECTION || "users",
        },
      },
      {
        resolve: "./src/modules/algolia",
        options: {
          appId: process.env.ALGOLIA_APP_ID!,
          apiKey: process.env.ALGOLIA_ADMIN_API_KEY!,
          productIndexName: process.env.ALGOLIA_PRODUCT_INDEX_NAME!,
        },
      },
      {
        resolve: "@medusajs/medusa/file",
        options: {
          providers: [
            localStack
              ? {
                  resolve: "@medusajs/medusa/file-local",
                  id: "local",
                  options: {},
                }
              : {
                  resolve: "@medusajs/medusa/file-s3",
                  id: "s3",
                  options: {
                    file_url: process.env.S3_FILE_URL,
                    access_key_id: process.env.S3_ACCESS_KEY_ID,
                    secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                    region: process.env.S3_REGION,
                    bucket: process.env.S3_BUCKET,
                    endpoint: process.env.S3_ENDPOINT,
                    // other options...
                  },
                },
          ],
        },
      },
      {
        resolve: "@medusajs/medusa/analytics",
        options: {
          providers: [
            localStack
              ? {
                  resolve: "@medusajs/medusa/analytics-local",
                  id: "local",
                  options: {},
                }
              : {
                  resolve: "@medusajs/analytics-posthog",
                  id: "posthog",
                  options: {
                    posthogEventsKey: process.env.POSTHOG_EVENTS_API_KEY,
                    posthogHost:
                      process.env.POSTHOG_HOST || "https://eu.i.posthog.com",
                  },
                },
          ],
        },
      },
      {
        resolve: "@medusajs/medusa/notification",
        options: {
          providers: [
            localStack
              ? {
                  resolve: "@medusajs/medusa/notification-local",
                  id: "local",
                  options: { channels: ["email"] },
                }
              : {
                  resolve: "./src/modules/resend",
                  id: "resend",
                  options: {
                    channels: ["email"],
                    api_key: process.env.RESEND_API_KEY,
                    from: process.env.RESEND_FROM_EMAIL,
                  },
                },
          ],
        },
      },
      {
        resolve: "./src/modules/invoice-generator",
      },
      ...redisInfra,
      ...fashionModules,
    ],
    plugins: [
      {
        resolve: "@medusajs/draft-order",
        options: {},
      },
    ],
    admin: {
      path: (process.env.MEDUSA_ADMIN_PATH || "/app") as `/${string}`,
      // Workers never serve the dashboard.
      disable: workerMode === "worker",
    },
    projectConfig: {
      databaseUrl: getDatabaseUrl(),
      workerMode,
      // With Redis configured, sessions are stored there instead of in each
      // pod's memory, so any replica can serve any admin request.
      ...(useRedis ? { redisUrl } : {}),
      http: httpConfig,
      // Bound the connection pool per replica: replicas x max must stay below
      // Postgres max_connections (use PgBouncer in front for large fleets).
      databaseDriverOptions: {
        pool: {
          min: integer(process.env.DB_POOL_MIN, 2),
          max: integer(process.env.DB_POOL_MAX, 10),
          idleTimeoutMillis: integer(process.env.DB_POOL_IDLE_MS, 30000),
        },
        ...(process.env.DB_SSL === "true"
          ? {
              connection: {
                ssl: {
                  rejectUnauthorized:
                    process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
                },
              },
            }
          : {}),
      },
    },
  });
}
