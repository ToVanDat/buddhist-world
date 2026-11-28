import { describe, expect, it, vi } from "vitest";
import { closeAudioContextIfCurrent } from "./voiceAudioLifecycle";

describe("voice AudioContext lifecycle", () => {
  it("closes and clears the current context", async () => {
    const context = { close: vi.fn(async () => undefined) };
    const clear = vi.fn();
    await expect(closeAudioContextIfCurrent(context, context, clear)).resolves.toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("does not close a newer connection context when a stale attempt finishes", async () => {
    const stale = { close: vi.fn(async () => undefined) };
    const current = { close: vi.fn(async () => undefined) };
    const clear = vi.fn();
    await expect(closeAudioContextIfCurrent(stale, current, clear)).resolves.toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
  });

  it("clears the active reference even if browser context close rejects", async () => {
    const context = { close: vi.fn(async () => { throw new Error("context already closed"); }) };
    const clear = vi.fn();
    await expect(closeAudioContextIfCurrent(context, context, clear)).resolves.toBe(true);
    expect(clear).toHaveBeenCalledOnce();
  });
});
