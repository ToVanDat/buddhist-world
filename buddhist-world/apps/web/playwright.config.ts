import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./visual-tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]] : "list",
  outputDir: "test-results/visual-qa",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "pnpm dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173/visual-qa.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
