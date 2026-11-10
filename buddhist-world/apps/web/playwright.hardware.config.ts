import { defineConfig, devices } from "@playwright/test";

// Separate from the SwiftShader CI config. Run only on a machine with a physical GPU.
export default defineConfig({
  testDir: "./visual-tests",
  testMatch: "gpu-hardware.visual.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-gpu", open: "never" }]],
  outputDir: "test-results/gpu-hardware",
  use: {
    baseURL: "http://127.0.0.1:5174",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--enable-webgl", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-software-rasterizer"],
    },
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174/",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
