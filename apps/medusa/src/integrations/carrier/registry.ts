import { JTCarrierProvider } from "../jt/provider";
import type { CarrierProvider } from "./provider";
import { SandboxCarrierProvider } from "./sandbox";

const providers = new Map<string, CarrierProvider>();

/** Registers (or replaces) a provider; used by tests and custom carriers. */
export const registerCarrierProvider = (provider: CarrierProvider): void => {
  providers.set(provider.code, provider);
};

/**
 * Resolves a carrier by code. `CARRIER_SANDBOX=true` swaps in the in-process
 * sandbox so no real carrier traffic is ever generated in dev/CI.
 */
export const getCarrierProvider = (code: string): CarrierProvider => {
  const existing = providers.get(code);
  if (existing) {
    return existing;
  }
  let created: CarrierProvider;
  if (process.env.CARRIER_SANDBOX === "true") {
    created = new SandboxCarrierProvider(code);
  } else if (code === "JT") {
    created = JTCarrierProvider.fromEnv();
  } else {
    throw new Error(`No carrier provider registered for ${code}`);
  }
  providers.set(code, created);
  return created;
};

export const DEFAULT_CARRIER = "JT";
