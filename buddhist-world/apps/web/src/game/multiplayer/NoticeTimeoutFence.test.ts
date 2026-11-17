import { describe, expect, it } from "vitest";
import { NoticeTimeoutFence } from "./NoticeTimeoutFence";

describe("NoticeTimeoutFence", () => {
  it("prevents an older timeout from clearing a newer notice", () => {
    const fence = new NoticeTimeoutFence();
    const older = fence.begin("interaction");
    const newer = fence.begin("interaction");

    expect(fence.isCurrent("interaction", older)).toBe(false);
    expect(fence.isCurrent("interaction", newer)).toBe(true);
  });

  it("keeps interaction and network notice lifecycles independent", () => {
    const fence = new NoticeTimeoutFence();
    const interaction = fence.begin("interaction");
    const network = fence.begin("network");

    fence.begin("interaction");

    expect(fence.isCurrent("interaction", interaction)).toBe(false);
    expect(fence.isCurrent("network", network)).toBe(true);
  });

  it("invalidates both transient notice timers across disconnect and reconnect", () => {
    const fence = new NoticeTimeoutFence();
    const interactionBeforeReconnect = fence.begin("interaction");
    const networkBeforeReconnect = fence.begin("network");

    fence.invalidate("interaction");
    fence.invalidate("network");
    const interactionAfterReconnect = fence.begin("interaction");
    const networkAfterReconnect = fence.begin("network");

    expect(fence.isCurrent("interaction", interactionBeforeReconnect)).toBe(false);
    expect(fence.isCurrent("network", networkBeforeReconnect)).toBe(false);
    expect(fence.isCurrent("interaction", interactionAfterReconnect)).toBe(true);
    expect(fence.isCurrent("network", networkAfterReconnect)).toBe(true);
  });

  it("invalidates a pending timeout when the context is cleared", () => {
    const fence = new NoticeTimeoutFence();
    const pending = fence.begin("interaction");

    fence.begin("interaction");

    expect(fence.isCurrent("interaction", pending)).toBe(false);
  });
});
