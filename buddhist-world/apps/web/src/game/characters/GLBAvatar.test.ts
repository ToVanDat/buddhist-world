import { describe, expect, it } from "vitest";
import { AnimationClip } from "three";
import { findMotionClip } from "./GLBAvatar";

const clip = (name: string) => new AnimationClip(name, 1, []);

describe("GLB animation clip resolution", () => {
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

  it("returns undefined when no supported motion clip exists", () => {
    expect(findMotionClip([clip("Dance")], "walk")).toBeUndefined();
  });
});
