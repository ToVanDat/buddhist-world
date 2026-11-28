# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gpu-hardware.visual.spec.ts >> records sustained frame-time on a physical WebGL GPU
- Location: visual-tests\gpu-hardware.visual.spec.ts:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.evaluate: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- main [ref=e1]:
  - complementary "Lighting visual QA settings":
    - strong: BUDDHIST WORLD · LIGHTING QA
    - generic: "Preset: day"
    - generic: "Quality: HIGH"
    - generic: "Weather: clear (0.0)"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("records sustained frame-time on a physical WebGL GPU", async ({ page }, testInfo) => {
  4  |   await page.setViewportSize({ width: 1920, height: 1080 });
  5  |   await page.goto("/visual-qa.html?preset=day&quality=HIGH&weather=clear");
  6  |   await expect(page.locator("canvas")).toBeVisible();
  7  |   await page.waitForFunction(() => document.documentElement.dataset.webglCreated === "true" && document.documentElement.dataset.visualQaReady === "true");
  8  | 
> 9  |   const metrics = await page.evaluate(async () => {
     |                              ^ Error: page.evaluate: Test timeout of 30000ms exceeded.
  10 |     const canvas = document.querySelector("canvas");
  11 |     const gl = (canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")) as WebGLRenderingContext | null;
  12 |     if (!gl) throw new Error("WebGL is unavailable on this browser/device.");
  13 |     const debug = gl.getExtension("WEBGL_debug_renderer_info") as {
  14 |       UNMASKED_VENDOR_WEBGL: number;
  15 |       UNMASKED_RENDERER_WEBGL: number;
  16 |     } | null;
  17 |     const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "renderer-info-unavailable";
  18 |     const vendor = debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : "vendor-info-unavailable";
  19 |     const softwareRenderer = /swiftshader|llvmpipe|softpipe|software raster|mesa offscreen/i.test(renderer);
  20 |     const memory = (performance as Performance & {
  21 |       memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  22 |     }).memory;
  23 | 
  24 |     // Warm shaders, pipelines and textures before collecting the sustained sample.
  25 |     await new Promise<void>((resolve) => {
  26 |       const start = performance.now();
  27 |       const warm = (now: number) => now - start < 8000 ? requestAnimationFrame(warm) : resolve();
  28 |       requestAnimationFrame(warm);
  29 |     });
  30 | 
  31 |     const samples: number[] = [];
  32 |     await new Promise<void>((resolve) => {
  33 |       let previous = performance.now();
  34 |       const started = previous;
  35 |       const sample = (now: number) => {
  36 |         samples.push(now - previous);
  37 |         previous = now;
  38 |         if (now - started < 30000) requestAnimationFrame(sample);
  39 |         else resolve();
  40 |       };
  41 |       requestAnimationFrame(sample);
  42 |     });
  43 |     const sorted = [...samples].sort((a, b) => a - b);
  44 |     const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
  45 |     return {
  46 |       renderer, vendor, softwareRenderer,
  47 |       webglVersion: String(gl.getParameter(gl.VERSION)),
  48 |       shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
  49 |       maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
  50 |       sampleCount: samples.length,
  51 |       averageFrameMs: samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length),
  52 |       p50FrameMs: percentile(0.5),
  53 |       p95FrameMs: percentile(0.95),
  54 |       p99FrameMs: percentile(0.99),
  55 |       maxFrameMs: Math.max(...samples),
  56 |       framesOver16_7ms: samples.filter((value) => value > 16.667).length,
  57 |       framesOver33_3ms: samples.filter((value) => value > 33.333).length,
  58 |       jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
  59 |       jsHeapTotalBytes: memory?.totalJSHeapSize ?? null,
  60 |       gpuMemoryBytes: null,
  61 |       note: "GPU VRAM is not exposed by standard WebGL. Use vendor profiler/OS telemetry for dedicated GPU memory and thermals.",
  62 |     };
  63 |   });
  64 | 
  65 |   await testInfo.attach("physical-gpu-benchmark.json", {
  66 |     body: Buffer.from(JSON.stringify(metrics, null, 2)),
  67 |     contentType: "application/json",
  68 |   });
  69 |   expect(metrics.softwareRenderer, `Software renderer detected: ${metrics.renderer}. This is not a physical-GPU benchmark.`).toBe(false);
  70 |   expect(metrics.sampleCount).toBeGreaterThan(300);
  71 |   expect(metrics.p95FrameMs).toBeGreaterThan(0);
  72 | });
  73 | 
```