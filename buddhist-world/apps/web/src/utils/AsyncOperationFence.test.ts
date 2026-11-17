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


describe("AsyncMutationGate", () => {
  it("allows only one journal mutation at a time across action types", async () => {
    const { AsyncMutationGate } = await import("./AsyncMutationGate");
    const gate = new AsyncMutationGate();
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });

  it("does not become unlocked when release is called more than once", async () => {
    const { AsyncMutationGate } = await import("./AsyncMutationGate");
    const gate = new AsyncMutationGate();
    expect(gate.tryAcquire()).toBe(true);
    gate.release();
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });
});
