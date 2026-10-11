import type { LoaderOptions } from "@medusajs/framework/types";
import type { MedusaContainer } from "@medusajs/framework/types";

import analyticsMarts from "./analytics-marts";
import maskLogs from "./mask-logs";
import validateSecrets from "./validate-secrets";

/**
 * Start-up duties of the platform. Medusa 2 does not run a top-level
 * `src/loaders` folder, so they hang on the integration module, whose loader
 * runs in every process (server, worker, migrate) before traffic is served:
 * 1. refuse to start in production with missing or default secrets;
 * 2. put the PII mask in front of every log line;
 * 3. create the read-only analytics views once their tables exist.
 */
export default async function platformStartup({
  container,
}: LoaderOptions): Promise<void> {
  const scope = container as unknown as MedusaContainer;
  await validateSecrets();
  await maskLogs(scope);
  await analyticsMarts(scope);
}
