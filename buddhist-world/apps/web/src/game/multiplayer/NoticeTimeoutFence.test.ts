import { afterEach, describe, expect, it, vi } from "vitest";
import { NoticeTimeoutFence } from "./NoticeTimeoutFence";
afterEach(() => vi.useRealTimers());

describe("NoticeTimeoutFence", () => {
  it("prevents an older timeout from clearing a newer notice", () => {
    vi.useFakeTimers();
    const fence = new NoticeTimeoutFence(), cleared: string[] = [];
    fence.schedule("interaction", 1000, () => cleared.push("old"));
    fence.schedule("interaction", 2000, () => cleared.push("new"));
    vi.advanceTimersByTime(1000);
    expect(cleared).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(cleared).toEqual(["new"]);
  });
  it("keeps interaction and network notice lifecycles independent", () => {
    vi.useFakeTimers();
    const fence = new NoticeTimeoutFence(), cleared: string[] = [];
    const interaction = fence.schedule("interaction", 1000, () => cleared.push("interaction"));
    const network = fence.schedule("network", 1000, () => cleared.push("network"));
    fence.invalidate("interaction");
    expect(fence.isCurrent("interaction", interaction)).toBe(false);
    expect(fence.isCurrent("network", network)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(cleared).toEqual(["network"]);
  });
  it("cancels pending notice callbacks across disconnect and reconnect", () => {
    vi.useFakeTimers();
    const fence = new NoticeTimeoutFence(), cleared: string[] = [];
    const oldI = fence.schedule("interaction", 3000, () => cleared.push("old interaction"));
    const oldN = fence.schedule("network", 3000, () => cleared.push("old network"));
    fence.invalidateAll();
    const newI = fence.schedule("interaction", 5000, () => cleared.push("new interaction"));
    const newN = fence.schedule("network", 5000, () => cleared.push("new network"));
    expect(fence.isCurrent("interaction", oldI)).toBe(false);
    expect(fence.isCurrent("network", oldN)).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(cleared).toEqual([]);
    vi.advanceTimersByTime(2000);
    expect(cleared).toEqual(["new interaction", "new network"]);
    expect(fence.isCurrent("interaction", newI)).toBe(true);
    expect(fence.isCurrent("network", newN)).toBe(true);
  });
  it("cancels the underlying timer when a channel is invalidated", () => {
    vi.useFakeTimers();
    const fence = new NoticeTimeoutFence(), callback = vi.fn();
    fence.schedule("interaction", 1000, callback);
    fence.invalidate("interaction");
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });
});
