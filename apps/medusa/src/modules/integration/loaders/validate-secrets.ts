import { assertProductionSecrets } from "../../../lib/config/secrets";

/** The process does not start in production with missing or default secrets. */
export default async function validateSecrets(): Promise<void> {
  assertProductionSecrets();
}
