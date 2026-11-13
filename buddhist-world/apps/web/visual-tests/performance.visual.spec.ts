import { expect, test } from "@playwright/test";

const profiles = [
  { quality: "LOW", width: 1280, height: 800 },
  { quality: "MOBILE", width: 390, height: 844 },
  { quality: "MEDIUM", width: 1280, height: 800 },
  { quality: "HIGH", width: 1440, height: 900 },
  { quality: "ULTRA", width: 1920, height: 1080 },
] as const;

for (const profile of profiles) {
  test(`captures ${profile.quality} browser performance and renderer telemetry`, async ({ page }, testInfo) => {
    // SwiftShader can render very slowly at HIGH/ULTRA resolutions; allow the browser capture to finish.
    test.setTimeout(profile.quality === "HIGH" || profile.quality === "ULTRA" ? 90_000 : 45_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto(`/visual-qa.html?preset=day&quality=${profile.quality}&weather=clear`);
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByTestId("qa-quality")).toHaveText(`Quality: ${profile.quality}`);
    await page.waitForFunction(() =>
      document.documentElement.dataset.webglCreated === "true" &&
      document.documentElement.dataset.visualQaReady === "true" &&
      Boolean(document.documentElement.dataset.renderCalls)
    );
    await page.waitForTimeout(1200);

    const metrics = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const gl = (canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")) as WebGLRenderingContext | null;
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
      const dataset = document.documentElement.dataset;
      return {
        sampleCount: frameTimes.length,
        averageFrameMs: frameTimes.length ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length : 0,
        p50FrameMs: percentile(0.5),
        p95FrameMs: percentile(0.95),
        p99FrameMs: percentile(0.99),
        maxFrameMs: frameTimes.length ? Math.max(...frameTimes) : 0,
        drawCalls: Number(dataset.renderCalls ?? 0),
        triangles: Number(dataset.renderTriangles ?? 0),
        geometries: Number(dataset.memoryGeometries ?? 0),
        textures: Number(dataset.memoryTextures ?? 0),
        programs: Number(dataset.renderPrograms ?? 0),
        renderer: gl && debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : "unavailable",
        vendor: gl && debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : "unavailable",
        webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : "unavailable",
        maxTextureSize: gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0,
        jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
        jsHeapTotalBytes: memory?.totalJSHeapSize ?? null,
        jsHeapLimitBytes: memory?.jsHeapSizeLimit ?? null,
        gpuMemoryBytes: null,
        note: "Browser profile comparison. CI may use SwiftShader; only physical-GPU runs can establish target-device performance. WebGL does not expose portable VRAM usage.",
      };
    });

    // CI may throttle SwiftShader to only a few frames in the sampling window.
    // Require usable samples, not an arbitrary FPS-dependent count.
    expect(metrics.sampleCount).toBeGreaterThan(0);
    expect(metrics.p95FrameMs).toBeGreaterThan(0);
    expect(metrics.drawCalls).toBeGreaterThan(0);
    expect(errors, errors.join("\\n")).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${profile.quality.toLowerCase()}-scene.png`), fullPage: true });
    await testInfo.attach(`${profile.quality.toLowerCase()}-browser-performance.json`, {
      body: Buffer.from(JSON.stringify({ quality: profile.quality, viewport: { width: profile.width, height: profile.height }, ...metrics }, null, 2)),
      contentType: "application/json",
    });
  });
}
