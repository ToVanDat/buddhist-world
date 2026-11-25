import { describe, expect, it } from "vitest";
import { AnimationClip, VectorKeyframeTrack } from "three";
import { findDirectMotionClip, findMissingCharacterMotions, findMotionClip, findOneShotMotionClip, resolveAnimationDelta } from "./GLBAvatar";

const clip = (name: string) => new AnimationClip(name, 1, [new VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 1, 1, 1])]);

describe("GLB animation clip resolution", () => {
  it("bounds animation updates after tab suspension and rejects invalid deltas", () => {
    expect(resolveAnimationDelta(0.016)).toBe(0.016);
    expect(resolveAnimationDelta(2)).toBe(0.05);
    expect(resolveAnimationDelta(-1)).toBe(0);
    expect(resolveAnimationDelta(Number.NaN)).toBe(0);
    expect(resolveAnimationDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
  it("resolves common Blender and Mixamo clip names", () => {
    const idle = clip("mixamo.com|Idle");
    const walk = clip("Armature|Walking");
    const run = clip("Run");
    const jump = clip("Jumping");
    const clips = [idle, walk, run, jump];

    expect(findMotionClip(clips, "idle")).toBe(idle);
    expect(findMotionClip(clips, "walk")).toBe(walk);
    expect(findMotionClip(clips, "run")).toBe(run);
    expect(findMotionClip(clips, "jump")).toBe(jump);
  });

  it("maps authored NPC activity clips from Blender exports", () => {
    const talk = clip("npc_monk_talking");
    const pray = clip("Praying");
    const work = clip("Armature|Sweeping");
    const rest = clip("Sitting");
    const clips = [talk, pray, work, rest];

    expect(findMotionClip(clips, "talk")).toBe(talk);
    expect(findMotionClip(clips, "pray")).toBe(pray);
    expect(findMotionClip(clips, "work")).toBe(work);
    expect(findMotionClip(clips, "rest")).toBe(rest);
  });

  it("falls back to idle for NPC activities not authored in a GLB", () => {
    const idle = clip("npc_monk_idle");
    expect(findMotionClip([idle], "pray")).toBe(idle);
    expect(findMotionClip([idle], "talk")).toBe(idle);
  });

  it("falls back to a usable locomotion clip when a state is missing", () => {
    const idle = clip("Idle");
    const walk = clip("Walk");
    expect(findMotionClip([idle, walk], "run")).toBe(walk);
    expect(findMotionClip([idle], "jump")).toBe(idle);
  });

  it("plays dedicated ritual clips once but keeps generic fallback clips looping", () => {
    const bow = clip("Armature|FullProstration");
    const offer = clip("Offering");
    const bell = clip("BellStrike");
    const pray = clip("Praying");
    const work = clip("Sweeping");
    const idle = clip("Idle");

    expect(findOneShotMotionClip([bow, pray], "prostrate")).toBe(bow);
    expect(findOneShotMotionClip([offer, work], "incense")).toBe(offer);
    expect(findOneShotMotionClip([bell, work], "ringBell")).toBe(bell);
    expect(findOneShotMotionClip([pray, idle], "prostrate")).toBeUndefined();
    expect(findOneShotMotionClip([work, idle], "incense")).toBeUndefined();
    expect(findOneShotMotionClip([idle], "ringBell")).toBeUndefined();
    expect(findOneShotMotionClip([pray], "meditate")).toBeUndefined();
  });

  it("returns undefined when no supported motion clip exists", () => {
    expect(findMotionClip([clip("Dance")], "walk")).toBeUndefined();
  });

  it("does not confuse partial substrings with authored motion names", () => {
    expect(findMotionClip([clip("ForestWind")], "rest")).toBeUndefined();
    expect(findMotionClip([clip("Armature|Sitting")], "rest")?.name).toBe("Armature|Sitting");
  });

  it("validates the actual player and NPC animation clip contracts without fallback", () => {
    const playerClips = [clip("mixamo.com|Idle"), clip("Armature|Walking"), clip("Run"), clip("Jumping")];
    expect(findMissingCharacterMotions(playerClips, "player")).toEqual([]);
    expect(findMissingCharacterMotions(playerClips, "npc")).toEqual(["talk", "pray", "work", "rest"]);
    expect(findDirectMotionClip([clip("Walk")], "run")).toBeUndefined();
    expect(findDirectMotionClip([new AnimationClip("Idle", 1, [])], "idle")).toBeUndefined();
  });
});
