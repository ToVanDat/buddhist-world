import { expect, test } from "@playwright/test";

test("captures browser frame-time, WebGL capability and JS heap telemetry", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/visual-qa.html?preset=day&quality=HIGH&weather=clear");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.webglCreated === "true" && document.documentElement.dataset.visualQaReady === "true");

  const metrics = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") as WebGL2RenderingContext | null;
    const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info") as
      | { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number }
      | null;
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    }).memory;

    const frameTimes: number[] = [];
    await new Promise<void>((resolve) => {
      let previous = performance.now();
      const started = previous;
      const sample = (now: number) => {
        frameTimes.push(now - previous);
        previous = now;
        if (now - started < 3000) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });

    const sorted = [...frameTimes].sort((a, b) => a - b);
    const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
    return {
      sampleCount: frameTimes.length,
      averageFrameMs: frameTimes.length ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length : 0,
      p95FrameMs: percentile(0.95),
      maxFrameMs: frameTimes.length ? Math.max(...frameTimes) : 0,
      renderer: gl && debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : "unavailable",
      vendor: gl && debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : "unavailable",
      webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : "unavailable",
      maxTextureSize: gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0,
      jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
      jsHeapTotalBytes: memory?.totalJSHeapSize ?? null,
      jsHeapLimitBytes: memory?.jsHeapSizeLimit ?? null,
      gpuMemoryBytes: null,
      note: "Browser smoke telemetry only. WebGL does not expose portable VRAM usage; benchmark on target hardware before accepting performance budgets.",
    };
  });

  expect(metrics.sampleCount).toBeGreaterThan(30);
  expect(Number.isFinite(metrics.p95FrameMs)).toBe(true);
  await testInfo.attach("browser-performance.json", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });
});
