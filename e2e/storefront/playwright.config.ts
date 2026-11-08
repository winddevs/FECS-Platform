import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests for the storefront purchase flow.
 *
 * The stack is started separately (it is the same one `docker/e2e/run.sh up`
 * prepares: Medusa on :9100 plus the storefront):
 *
 *   bash docker/e2e/run.sh up
 *   bash docker/e2e/run.sh storefront
 *   (cd apps/store && ./node_modules/.bin/next dev --port 8000)
 *   cd e2e/storefront && pnpm setup     # once: deps + browsers
 *   pnpm test                           # or test:desktop / test:mobile
 *
 * Point the tests at another storefront with E2E_BASE_URL.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8000";
const NAVIGATION_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 180_000;
const EXPECT_TIMEOUT_MS = 20_000;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  // Every test builds its own cart, but the stock is shared, so keep it serial.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    locale: "vi-VN",
    navigationTimeout: NAVIGATION_TIMEOUT_MS,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
});
