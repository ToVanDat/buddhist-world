import { expect, test } from "@playwright/test";

const profiles = [
  { quality: "LOW", width: 1280, height: 800 },
  { quality: "MOBILE", width: 390, height: 844 },
  { quality: "MEDIUM", width: 1280, height: 800 },
  { quality: "HIGH", width: 1440, height: 900 },
  { quality: "ULTRA", width: 1920, height: 1080 },
] as const;

for (const profile of profiles) {
  test(`records physical-GPU performance for ${profile.quality}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto(`/visual-qa.html?preset=day&quality=${profile.quality}&weather=clear`);
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByTestId("qa-quality")).toHaveText(`Quality: ${profile.quality}`);
    await page.waitForFunction(() =>
      document.documentElement.dataset.webglCreated === "true" &&
      document.documentElement.dataset.visualQaReady === "true" &&
      Boolean(document.documentElement.dataset.renderCalls)
    );

    const metrics = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const gl = (canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")) as WebGLRenderingContext | null;
      if (!gl) throw new Error("WebGL is unavailable on this browser/device.");
      const debug = gl.getExtension("WEBGL_debug_renderer_info") as {
        UNMASKED_VENDOR_WEBGL: number;
        UNMASKED_RENDERER_WEBGL: number;
      } | null;
      const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "renderer-info-unavailable";
      const vendor = debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : "vendor-info-unavailable";
      const softwareRenderer = /swiftshader|llvmpipe|softpipe|software raster|mesa offscreen/i.test(renderer);
      const memory = (performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      }).memory;

      await new Promise<void>((resolve) => {
        const start = performance.now();
        const warm = (now: number) => now - start < 8000 ? requestAnimationFrame(warm) : resolve();
        requestAnimationFrame(warm);
      });

      const samples: number[] = [];
      await new Promise<void>((resolve) => {
        let previous = performance.now();
        const started = previous;
        const sample = (now: number) => {
          samples.push(now - previous);
          previous = now;
          if (now - started < 30000) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      const sorted = [...samples].sort((a, b) => a - b);
      const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
      const dataset = document.documentElement.dataset;
      return {
        renderer, vendor, softwareRenderer,
        webglVersion: String(gl.getParameter(gl.VERSION)),
        shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
        maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
        sampleCount: samples.length,
        averageFrameMs: samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length),
        p50FrameMs: percentile(0.5),
        p95FrameMs: percentile(0.95),
        p99FrameMs: percentile(0.99),
        maxFrameMs: Math.max(...samples),
        framesOver16_7ms: samples.filter((value) => value > 16.667).length,
        framesOver33_3ms: samples.filter((value) => value > 33.333).length,
        drawCalls: Number(dataset.renderCalls ?? 0),
        triangles: Number(dataset.renderTriangles ?? 0),
        geometries: Number(dataset.memoryGeometries ?? 0),
        textures: Number(dataset.memoryTextures ?? 0),
        programs: Number(dataset.renderPrograms ?? 0),
        jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
        jsHeapTotalBytes: memory?.totalJSHeapSize ?? null,
        gpuMemoryBytes: null,
        note: "Physical desktop GPU benchmark. MOBILE is a mobile quality profile and viewport emulation on this host, not a physical phone benchmark. GPU VRAM requires vendor/OS tooling.",
      };
    });

    await testInfo.attach(`${profile.quality.toLowerCase()}-physical-gpu.json`, {
      body: Buffer.from(JSON.stringify({ quality: profile.quality, viewport: { width: profile.width, height: profile.height }, ...metrics }, null, 2)),
      contentType: "application/json",
    });
    await page.screenshot({ path: testInfo.outputPath(`${profile.quality.toLowerCase()}-gpu.png`), fullPage: true });
    expect(metrics.softwareRenderer, `Software renderer detected: ${metrics.renderer}. This is not a physical-GPU benchmark.`).toBe(false);
    expect(metrics.sampleCount).toBeGreaterThan(300);
    expect(metrics.p95FrameMs).toBeGreaterThan(0);
    expect(metrics.drawCalls).toBeGreaterThan(0);
  });
}
