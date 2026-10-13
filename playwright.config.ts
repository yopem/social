import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/fixtures/setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: "test-results/artifacts",
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/html", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: "http://localhost:3200",
    extraHTTPHeaders: { Origin: "http://localhost:3200" },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
})
