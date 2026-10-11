import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { maskLogger } from "../lib/observability/pii";

/** Every log line passes through the PII mask (NFR-SEC-003). */
export default async function maskLogs(
  container: MedusaContainer
): Promise<void> {
  maskLogger(
    container.resolve(ContainerRegistrationKeys.LOGGER) as unknown as Record<
      string,
      unknown
    >
  );
}
