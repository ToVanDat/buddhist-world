import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type AnimationClip,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { AvatarMotion } from "./PlaceholderAvatar";

const CLIP_ALIASES: Record<AvatarMotion, string[]> = {
  idle: ["idle", "stand", "standing", "breath"],
  walk: ["walk", "walking"],
  run: ["run", "running", "sprint"],
  jump: ["jump", "jumping", "fall", "falling", "air"],
  talk: ["talk", "talking", "gesture", "greeting"],
  pray: ["pray", "praying", "meditation", "meditate"],
  work: ["work", "working", "sweep", "sweeping"],
  rest: ["rest", "sleep", "sitting", "sit"],
};

const FALLBACKS: Record<AvatarMotion, AvatarMotion[]> = {
  idle: ["idle", "walk", "run", "jump"],
  walk: ["walk", "idle"],
  run: ["run", "walk", "idle"],
  jump: ["jump", "idle"],
  talk: ["talk", "idle"],
  pray: ["pray", "idle"],
  work: ["work", "idle"],
  rest: ["rest", "idle"],
};

function normalizeClipName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Clamp mixer time steps after tab suspension or a dropped frame. */
export function resolveAnimationDelta(deltaSeconds: number): number {
  return Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
}

/** Resolve common Blender/Mixamo clip names without requiring a fixed naming convention. */
export function findMotionClip(
  clips: readonly AnimationClip[],
  motion: AvatarMotion,
): AnimationClip | undefined {
  for (const fallback of FALLBACKS[motion]) {
    const aliases = CLIP_ALIASES[fallback];
    const exact = clips.find((clip) => aliases.includes(normalizeClipName(clip.name)));
    if (exact) return exact;
    const partial = clips.find((clip) => aliases.some((alias) => normalizeClipName(clip.name).includes(alias)));
    if (partial) return partial;
  }
  return undefined;
}

/**
 * GLB character renderer using Three.js AnimationMixer.
 * A fresh SkeletonUtils clone is created per player so remote characters never share a skeleton.
 */
export function GLBAvatar({ src, getMotion }: { src: string; getMotion: () => AvatarMotion }) {
  const { scene, animations } = useGLTF(src);
  const model = useMemo(() => clone(scene), [scene]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const activeAction = useRef<AnimationAction | null>(null);
  const activeClip = useRef<AnimationClip | null>(null);

  useFrame((_, dt) => {
    const motion = getMotion();
    const clip = findMotionClip(animations, motion) ?? null;

    if (clip !== activeClip.current) {
      const next = clip ? mixer.clipAction(clip) : null;
      if (next) {
        next.reset();
        next.enabled = true;
        next.setEffectiveWeight(1);
        next.setEffectiveTimeScale(1);
        next.setLoop(motion === "jump" ? LoopOnce : LoopRepeat, motion === "jump" ? 1 : Infinity);
        next.clampWhenFinished = motion === "jump";
        next.fadeIn(0.2).play();
      }
      activeAction.current?.fadeOut(0.2);
      activeAction.current = next;
      activeClip.current = clip;
    }

    mixer.update(resolveAnimationDelta(dt));
  });

  useEffect(() => () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    activeAction.current = null;
    activeClip.current = null;
  }, [mixer, model]);

  return <primitive object={model} />;
}
