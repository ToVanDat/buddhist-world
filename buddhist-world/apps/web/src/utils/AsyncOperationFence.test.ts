import { describe, expect, it } from "vitest";
import { AsyncOperationFence } from "./AsyncOperationFence";

describe("AsyncOperationFence", () => {
  it("invalidates an older NPC request after switching context", () => {
    const fence = new AsyncOperationFence();
    const oldNpcRequest = fence.begin();
    const newNpcRequest = fence.begin();
    expect(fence.isCurrent(oldNpcRequest)).toBe(false);
    expect(fence.isCurrent(newNpcRequest)).toBe(true);
  });

  it("does not let cleanup from an old view invalidate its replacement", () => {
    const fence = new AsyncOperationFence();
    const oldView = fence.begin();
    const newView = fence.begin();
    fence.invalidate(oldView);
    expect(fence.isCurrent(newView)).toBe(true);
  });

  it("invalidates pending work when its view unmounts", () => {
    const fence = new AsyncOperationFence();
    const pending = fence.begin();
    fence.invalidate(pending);
    expect(fence.isCurrent(pending)).toBe(false);
  });
});
