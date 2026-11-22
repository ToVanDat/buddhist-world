import { describe, expect, it } from "vitest";
import { collectCrossedAnimationEvents, type AnimationTimelineEvent } from "./animationEvents";
const events: AnimationTimelineEvent[] = [
  { id: "contact", time: 0.42, name: "HandContact" },
  { id: "impact", time: 0.78, name: "PropImpact" },
  { id: "finish", time: 1.1, name: "InteractionFinished" },
];
describe("collectCrossedAnimationEvents", () => {
  it("collects forward crossed events including the end boundary", () => {
    expect(collectCrossedAnimationEvents(events, { previousTime: 0.4, currentTime: 0.8, duration: 1.2 }).map(x => x.id)).toEqual(["contact", "impact"]);
  });
  it("does not replay the previous-time boundary", () => {
    expect(collectCrossedAnimationEvents(events, { previousTime: 0.42, currentTime: 0.78, duration: 1.2 }).map(x => x.id)).toEqual(["impact"]);
  });
  it("handles one loop boundary in clip chronology", () => {
    expect(collectCrossedAnimationEvents(events, { previousTime: 1, currentTime: 0.5, duration: 1.2, looped: true }).map(x => x.id)).toEqual(["finish", "contact"]);
  });
  it("rejects invalid windows and malformed timestamps", () => {
    expect(collectCrossedAnimationEvents(events, { previousTime: 0.5, currentTime: 0.2, duration: 1.2 })).toEqual([]);
    expect(collectCrossedAnimationEvents([...events, { id: "bad", time: Number.NaN, name: "Bad" }], { previousTime: 0, currentTime: 2, duration: 1.2 })).toEqual(events);
    expect(collectCrossedAnimationEvents(events, { previousTime: 0, currentTime: 1, duration: 0 })).toEqual([]);
  });
  it("allows a non-looping mixer update to overshoot the clip end", () => {
    expect(collectCrossedAnimationEvents(events, { previousTime: 0, currentTime: 2, duration: 1.2 })).toEqual(events);
  });

  it("rejects windows outside the clip and inconsistent loop flags", () => {
    expect(collectCrossedAnimationEvents(events, { previousTime: -0.1, currentTime: 0.2, duration: 1.2 })).toEqual([]);
    expect(collectCrossedAnimationEvents(events, { previousTime: 0.2, currentTime: 1.3, duration: 1.2 })).toEqual([]);
    expect(collectCrossedAnimationEvents(events, { previousTime: 0.2, currentTime: 0.8, duration: 1.2, looped: true })).toEqual([]);
  });

  it("orders simultaneous events deterministically", () => {
    const same = [{ id: "b", time: 0.5, name: "Second" }, { id: "a", time: 0.5, name: "First" }];
    expect(collectCrossedAnimationEvents(same, { previousTime: 0, currentTime: 0.6, duration: 1 }).map(x => x.id)).toEqual(["a", "b"]);
    const mixedCase = [{ id: "a", time: 0.5, name: "Lower" }, { id: "B", time: 0.5, name: "Upper" }];
    expect(collectCrossedAnimationEvents(mixedCase, { previousTime: 0, currentTime: 0.6, duration: 1 }).map(x => x.id)).toEqual(["B", "a"]);
  });
});
