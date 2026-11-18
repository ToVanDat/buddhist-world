import { FrameTimeWindow, summarizeFrameTimes } from "./performanceMetrics";

export type Quality = "ULTRA" | "HIGH" | "MEDIUM" | "LOW" | "MOBILE";
export type QualityMode = "auto" | "manual";
export type GpuClass = "high" | "medium" | "low" | "unknown";

export interface HardwareCapabilities {
  cores: number | null;
  deviceMemoryGB: number | null;
  gpuClass: GpuClass;
  gpuRenderer: string | null;
  maxTextureSize: number | null;
  maxRenderbufferSize: number | null;
  webglAvailable: boolean;
  touch: boolean;
}

export interface QualityProfile {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  fog: boolean;
}

export const PROFILES: Record<Quality, QualityProfile> = {
  ULTRA:  { dpr: [1, 2], shadows: true, shadowMapSize: 4096, antialias: true, fog: true },
  HIGH:   { dpr: [1, 1.75], shadows: true, shadowMapSize: 2048, antialias: true, fog: true },
  MEDIUM: { dpr: [1, 1.25], shadows: true, shadowMapSize: 1024, antialias: true, fog: true },
  LOW:    { dpr: [0.75, 1], shadows: false, shadowMapSize: 512, antialias: false, fog: false },
  MOBILE: { dpr: [0.75, 1], shadows: false, shadowMapSize: 512, antialias: false, fog: true },
};

export const isTouchDevice = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches === true || "ontouchstart" in window);

function detectHardwareCapabilitiesUncached(): HardwareCapabilities {
  const nav = typeof navigator === "undefined" ? null : navigator;
  const deviceMemory = nav ? (nav as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  const cores = nav && Number.isFinite(nav.hardwareConcurrency) && nav.hardwareConcurrency > 0
    ? nav.hardwareConcurrency : null;
  const deviceMemoryGB = typeof deviceMemory === "number" && Number.isFinite(deviceMemory) && deviceMemory > 0
    ? deviceMemory : null;
  const touch = isTouchDevice();
  if (typeof document === "undefined") {
    return { cores, deviceMemoryGB, gpuClass: "unknown", gpuRenderer: null,
      maxTextureSize: null, maxRenderbufferSize: null, webglAvailable: false, touch };
  }

  const canvas = document.createElement("canvas");
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null
      ?? canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null;
    if (!gl) {
      return { cores, deviceMemoryGB, gpuClass: "unknown", gpuRenderer: null,
        maxTextureSize: null, maxRenderbufferSize: null, webglAvailable: false, touch };
    }
    const debug = gl.getExtension("WEBGL_debug_renderer_info") as
      (WEBGL_debug_renderer_info & { UNMASKED_RENDERER_WEBGL: number }) | null;
    const rendererValue = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const gpuRenderer = typeof rendererValue === "string" ? rendererValue.slice(0, 160) : null;
    const renderer = (gpuRenderer ?? "").toLowerCase();
    let gpuClass: GpuClass = "unknown";
    if (/swiftshader|llvmpipe|software|microsoft basic render|intel.*(hd|uhd|iris)|adreno 5|mali-t[0-7]/i.test(renderer)) gpuClass = "low";
    else if (/geforce|rtx|radeon rx|apple m[1-9]|adreno 7|mali-g[7-9]/i.test(renderer)) gpuClass = "high";
    else if (/adreno|mali|radeon|nvidia|apple gpu/i.test(renderer)) gpuClass = "medium";
    const capabilities = {
      cores, deviceMemoryGB, gpuClass, gpuRenderer,
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || null,
      maxRenderbufferSize: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || null,
      webglAvailable: true, touch,
    };
    // Release this temporary capability-probe context; the game creates its own renderer.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return capabilities;
  } catch {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return { cores, deviceMemoryGB, gpuClass: "unknown", gpuRenderer: null,
      maxTextureSize: null, maxRenderbufferSize: null, webglAvailable: false, touch };
  }
}

let cachedHardwareCapabilities: HardwareCapabilities | null = null;

/** Cache the WebGL probe so store initialization and GameCanvas do not create extra contexts. */
export function detectHardwareCapabilities(): HardwareCapabilities {
  if (!cachedHardwareCapabilities) cachedHardwareCapabilities = detectHardwareCapabilitiesUncached();
  return { ...cachedHardwareCapabilities };
}

export function resolveInitialQuality(capabilities: HardwareCapabilities): Quality {
  if (!capabilities.webglAvailable) return "LOW";
  if (capabilities.gpuClass === "low" ||
      (capabilities.deviceMemoryGB !== null && capabilities.deviceMemoryGB <= 4) ||
      (capabilities.maxTextureSize !== null && capabilities.maxTextureSize < 4096)) return "LOW";
  if (capabilities.touch) return "MOBILE";
  if (capabilities.gpuClass === "high" && (capabilities.cores ?? 0) >= 8 &&
      (capabilities.deviceMemoryGB ?? 0) >= 8 && (capabilities.maxTextureSize ?? 0) >= 8192) return "ULTRA";
  if (capabilities.gpuClass === "high" && (capabilities.cores ?? 0) >= 6 &&
      (capabilities.deviceMemoryGB === null || capabilities.deviceMemoryGB >= 6)) return "HIGH";
  // Missing GPU/memory information is not interpreted as high-end hardware.
  return "MEDIUM";
}

export function detectInitialQuality(): Quality {
  return resolveInitialQuality(detectHardwareCapabilities());
}

const QUALITY_ORDER: Quality[] = ["MOBILE", "LOW", "MEDIUM", "HIGH", "ULTRA"];
function capQuality(requested: Quality, maximum: Quality): Quality {
  return QUALITY_ORDER[Math.min(QUALITY_ORDER.indexOf(requested), QUALITY_ORDER.indexOf(maximum))]!;
}

/** Applies only conservative limits supported by exposed device capabilities. */
export function resolveQualityProfile(quality: Quality, capabilities: HardwareCapabilities): QualityProfile {
  if (!capabilities.webglAvailable) return { ...PROFILES.LOW };
  let maximum: Quality = "MEDIUM";
  if (capabilities.gpuClass === "low" ||
      (capabilities.deviceMemoryGB !== null && capabilities.deviceMemoryGB <= 4) ||
      (capabilities.maxTextureSize !== null && capabilities.maxTextureSize < 4096) ||
      (capabilities.maxRenderbufferSize !== null && capabilities.maxRenderbufferSize < 4096)) {
    maximum = "LOW";
  } else if (capabilities.gpuClass === "high" && (capabilities.deviceMemoryGB ?? 0) >= 8 &&
      (capabilities.maxTextureSize ?? 0) >= 8192) {
    maximum = "ULTRA";
  } else if (capabilities.gpuClass === "high") {
    maximum = "HIGH";
  }
  return { ...PROFILES[capQuality(quality, maximum)] };
}

export function stepDown(q: Quality): Quality {
  if (q === "ULTRA") return "HIGH";
  if (q === "HIGH") return "MEDIUM";
  if (q === "MEDIUM") return "LOW";
  if (q === "LOW") return "MOBILE";
  return "MOBILE";
}

export function stepUp(q: Quality): Quality {
  if (q === "MOBILE") return "LOW";
  if (q === "LOW") return "MEDIUM";
  if (q === "MEDIUM") return "HIGH";
  if (q === "HIGH") return "ULTRA";
  return "ULTRA";
}

/** Frame-time hysteresis: degrade after sustained pressure, recover more slowly. */
export class AdaptiveQualityController {
  private readonly window = new FrameTimeWindow(180);
  private poorFrames = 0;
  private goodFrames = 0;
  private lastChangeAt = Number.NEGATIVE_INFINITY;

  reset() {
    this.window.clear();
    this.poorFrames = 0;
    this.goodFrames = 0;
    this.lastChangeAt = Number.NEGATIVE_INFINITY;
  }

  observe(frameTimeMs: number, current: Quality, nowMs: number, automatic = true): Quality | null {
    if (!automatic) {
      this.reset();
      return null;
    }
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0 || !Number.isFinite(nowMs)) return null;
    this.window.push(frameTimeMs);
    const samples = this.window.snapshot();
    if (samples.length < 60) return null;
    const metrics = summarizeFrameTimes(samples);
    const poor = metrics.p95Ms > 24 || metrics.hitchFrames >= 8;
    const good = metrics.p95Ms < 15.5 && metrics.hitchFrames === 0;
    if (poor) {
      this.poorFrames += 1;
      this.goodFrames = 0;
    } else if (good) {
      this.goodFrames += 1;
      this.poorFrames = 0;
    } else {
      this.poorFrames = Math.max(0, this.poorFrames - 1);
      this.goodFrames = 0;
    }
    if (nowMs - this.lastChangeAt < 12_000) return null;
    if (this.poorFrames >= 120) {
      const next = stepDown(current);
      if (next !== current) {
        this.lastChangeAt = nowMs;
        this.poorFrames = 0;
        this.goodFrames = 0;
        return next;
      }
    }
    if (this.goodFrames >= 600) {
      const next = stepUp(current);
      if (next !== current) {
        this.lastChangeAt = nowMs;
        this.poorFrames = 0;
        this.goodFrames = 0;
        return next;
      }
    }
    return null;
  }
}
