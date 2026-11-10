import { expect, test } from "@playwright/test";

test("records sustained frame-time on a physical WebGL GPU", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/visual-qa.html?preset=day&quality=HIGH&weather=clear");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.webglCreated === "true" && document.documentElement.dataset.visualQaReady === "true");

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

    // Warm shaders, pipelines and textures before collecting the sustained sample.
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
      jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
      jsHeapTotalBytes: memory?.totalJSHeapSize ?? null,
      gpuMemoryBytes: null,
      note: "GPU VRAM is not exposed by standard WebGL. Use vendor profiler/OS telemetry for dedicated GPU memory and thermals.",
    };
  });

  await testInfo.attach("physical-gpu-benchmark.json", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });
  expect(metrics.softwareRenderer, `Software renderer detected: ${metrics.renderer}. This is not a physical-GPU benchmark.`).toBe(false);
  expect(metrics.sampleCount).toBeGreaterThan(300);
  expect(metrics.p95FrameMs).toBeGreaterThan(0);
});
