import { describe, expect, it, vi } from "vitest";
import { disposePostProcessingResources } from "./postProcessingLifecycle";

describe("post-processing resource lifecycle", () => {
  it("disposes passes and depth attachments before composer targets", () => {
    const order: string[] = [];
    const composer = {
      passes: [
        { dispose: vi.fn(() => order.push("render-pass")) },
        { dispose: vi.fn(() => order.push("bloom-pass")) },
        { dispose: vi.fn(() => order.push("grade-pass")) },
      ],
      renderTarget1: { depthTexture: { dispose: vi.fn(() => order.push("depth-1")) } },
      renderTarget2: { depthTexture: { dispose: vi.fn(() => order.push("depth-2")) } },
      dispose: vi.fn(() => order.push("composer")),
    };
    disposePostProcessingResources(composer);
    expect(order).toEqual(["render-pass", "bloom-pass", "grade-pass", "depth-1", "depth-2", "composer"]);
    expect(composer.dispose).toHaveBeenCalledTimes(1);
  });

  it("supports passes without custom disposal and targets without depth textures", () => {
    const dispose = vi.fn();
    const composer = {
      passes: [{}, { dispose: undefined }],
      renderTarget1: { depthTexture: null },
      renderTarget2: {},
      dispose,
    };
    expect(() => disposePostProcessingResources(composer)).not.toThrow();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
