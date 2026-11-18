import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "playwright-report-e2e", open: "never" }]] : "list",
  outputDir: "test-results/full-stack-e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "pnpm exec tsx src/index.ts",
      cwd: "../server",
      url: "http://127.0.0.1:3001/api/health/ready",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173/",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
