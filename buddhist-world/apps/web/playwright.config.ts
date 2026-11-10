import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./visual-tests",
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
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
    command: "pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
