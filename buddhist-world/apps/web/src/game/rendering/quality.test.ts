import { describe, expect, it } from "vitest";
import {
  AdaptiveQualityController, resolveInitialQuality, resolveMaximumQuality, resolveQualityProfile,
  stepDown, stepUp, type HardwareCapabilities, type Quality,
} from "./quality";

const unknownHardware: HardwareCapabilities = {
  cores: null, deviceMemoryGB: null, gpuClass: "unknown", gpuRenderer: null,
  maxTextureSize: null, maxRenderbufferSize: null, webglAvailable: true, touch: false,
};
const strongHardware: HardwareCapabilities = {
  cores: 12, deviceMemoryGB: 16, gpuClass: "high", gpuRenderer: "NVIDIA RTX",
  maxTextureSize: 16384, maxRenderbufferSize: 16384, webglAvailable: true, touch: false,
};
const weakHardware: HardwareCapabilities = {
  cores: 4, deviceMemoryGB: 4, gpuClass: "low", gpuRenderer: "software",
  maxTextureSize: 2048, maxRenderbufferSize: 2048, webglAvailable: true, touch: false,
};

describe("adaptive quality tiers", () => {
  const tiers: Quality[] = ["ULTRA", "HIGH", "MEDIUM", "LOW", "MOBILE"];
  it("steps down one tier at a time and stays at the minimum", () => {
    expect(tiers.map(stepDown)).toEqual(["HIGH", "MEDIUM", "LOW", "MOBILE", "MOBILE"]);
  });
  it("steps up one tier at a time and stays at the maximum", () => {
    expect(tiers.map(stepUp)).toEqual(["ULTRA", "ULTRA", "HIGH", "MEDIUM", "LOW"]);
  });
  it("uses a conservative fallback when GPU information is unavailable", () => {
    expect(resolveInitialQuality(unknownHardware)).toBe("MEDIUM");
  });
  it("selects a high tier only when multiple hardware signals agree", () => {
    expect(resolveInitialQuality(strongHardware)).toBe("ULTRA");
    expect(resolveInitialQuality(weakHardware)).toBe("LOW");
    expect(resolveInitialQuality({ ...strongHardware, touch: true })).toBe("MOBILE");
  });
  it("uses a mobile ceiling on touch devices and a conservative ceiling on unknown GPUs", () => {
    expect(resolveMaximumQuality({ ...strongHardware, touch: true })).toBe("MOBILE");
    expect(resolveMaximumQuality(unknownHardware)).toBe("MEDIUM");
    expect(resolveMaximumQuality({ ...unknownHardware, webglAvailable: false })).toBe("LOW");
  });
  it("requires renderbuffer headroom before enabling the ultra tier", () => {
    expect(resolveMaximumQuality(strongHardware)).toBe("ULTRA");
    expect(resolveMaximumQuality({ ...strongHardware, maxRenderbufferSize: 4096 })).toBe("HIGH");
  });
  it("caps quality profiles when reported device limits are low", () => {
    expect(resolveQualityProfile("ULTRA", weakHardware)).toEqual(resolveQualityProfile("LOW", weakHardware));
    expect(resolveQualityProfile("ULTRA", { ...strongHardware, touch: true })).toEqual(resolveQualityProfile("MOBILE", { ...strongHardware, touch: true }));
    expect(resolveQualityProfile("ULTRA", { ...unknownHardware, webglAvailable: false })).toEqual(resolveQualityProfile("LOW", { ...unknownHardware, webglAvailable: false }));
  });
});

describe("frame-time adaptive controller", () => {
  it("steps down after sustained frame-time pressure, not a single spike", () => {
    const controller = new AdaptiveQualityController();
    expect(controller.observe(90, "HIGH", 0)).toBeNull();
    let next: Quality | null = null;
    for (let frame = 0; frame < 240; frame += 1) {
      next = controller.observe(30, "HIGH", frame * 16.7) ?? next;
    }
    expect(next).toBe("MEDIUM");
  });
  it("recovers only after a longer stable period", () => {
    const controller = new AdaptiveQualityController();
    let now = 0;
    let next: Quality | null = null;
    for (let frame = 0; frame < 240; frame += 1) {
      next = controller.observe(30, "MEDIUM", now) ?? next;
      now += 16.7;
    }
    expect(next).toBe("LOW");
    next = null;
    for (let frame = 0; frame < 900; frame += 1) {
      next = controller.observe(12, "LOW", now) ?? next;
      now += 16.7;
    }
    expect(next).toBe("MEDIUM");
  });
  it("never recovers above the hardware ceiling", () => {
    const controller = new AdaptiveQualityController();
    let next: Quality | null = null;
    for (let frame = 0; frame < 900; frame += 1) {
      next = controller.observe(12, "LOW", frame * 16.7, true, "LOW") ?? next;
    }
    expect(next).toBeNull();
  });
  it("does not adapt while the user has selected a manual quality", () => {
    const controller = new AdaptiveQualityController();
    let next: Quality | null = null;
    for (let frame = 0; frame < 500; frame += 1) {
      next = controller.observe(40, "ULTRA", frame * 16.7, false) ?? next;
    }
    expect(next).toBeNull();
  });
});
