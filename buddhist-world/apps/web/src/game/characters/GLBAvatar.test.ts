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
