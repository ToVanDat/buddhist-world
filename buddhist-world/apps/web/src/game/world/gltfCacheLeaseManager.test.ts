import { afterEach, describe, expect, it, vi } from "vitest";
import { GLTFCacheLeaseManager } from "./gltfCacheLeaseManager";
afterEach(() => vi.useRealTimers());
describe("GLTFCacheLeaseManager", () => {
  it("does not evict while any consumer still holds a lease", () => {
    vi.useFakeTimers();
    const manager = new GLTFCacheLeaseManager({ idleGraceMs: 100, maxIdleEntries: 8 }), clear = vi.fn();
    const a = manager.retain("/assets/tree.glb", clear), b = manager.retain("/assets/tree.glb", clear);
    a(); vi.advanceTimersByTime(200);
    expect(clear).not.toHaveBeenCalled();
    expect(manager.referenceCount("/assets/tree.glb")).toBe(1);
    b(); vi.advanceTimersByTime(100);
    expect(clear).toHaveBeenCalledTimes(1);
  });
  it("cancels eviction when a chunk remounts during the grace period", () => {
    vi.useFakeTimers();
    const manager = new GLTFCacheLeaseManager({ idleGraceMs: 100, maxIdleEntries: 8 }), clear = vi.fn();
    manager.retain("/assets/gate.glb", clear)(); vi.advanceTimersByTime(50);
    const release = manager.retain("/assets/gate.glb", clear);
    vi.advanceTimersByTime(100);
    expect(clear).not.toHaveBeenCalled();
    expect(manager.referenceCount("/assets/gate.glb")).toBe(1);
    release(); vi.advanceTimersByTime(100);
    expect(clear).toHaveBeenCalledTimes(1);
  });
  it("enforces idle cache budget without evicting active GLBs", () => {
    vi.useFakeTimers();
    const manager = new GLTFCacheLeaseManager({ idleGraceMs: 10_000, maxIdleEntries: 1 });
    const clearA = vi.fn(), clearB = vi.fn();
    manager.retain("/assets/a.glb", clearA)();
    manager.retain("/assets/b.glb", clearB);
    expect(clearA).toHaveBeenCalledTimes(1);
    expect(clearB).not.toHaveBeenCalled();
    expect(manager.referenceCount("/assets/b.glb")).toBe(1);
  });
  it("makes release idempotent", () => {
    const manager = new GLTFCacheLeaseManager(), release = manager.retain("/assets/a.glb", vi.fn());
    release(); release();
    expect(manager.referenceCount("/assets/a.glb")).toBe(0);
  });
});
