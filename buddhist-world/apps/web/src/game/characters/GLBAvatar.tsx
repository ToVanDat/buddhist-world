import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
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

/** Runtime motion names shared by the player and scheduled NPC actors. */
export const PLAYER_REQUIRED_MOTIONS = ["idle", "walk", "run", "jump"] as const satisfies readonly AvatarMotion[];
export const NPC_REQUIRED_MOTIONS = ["idle", "walk", "talk", "pray", "work", "rest"] as const satisfies readonly AvatarMotion[];

export const CHARACTER_CLIP_ALIASES: Record<AvatarMotion, readonly string[]> = {
  idle: ["idle", "stand", "standing", "breath"],
  walk: ["walk", "walking"],
  run: ["run", "running", "sprint"],
  jump: ["jump", "jumping", "fall", "falling", "air"],
  talk: ["talk", "talking", "gesture", "greeting"],
  pray: ["pray", "praying", "meditation", "meditate"],
  work: ["work", "working", "sweep", "sweeping"],
  rest: ["rest", "sleep", "sitting", "sit"],
};

const FALLBACKS: Record<AvatarMotion, readonly AvatarMotion[]> = {
  idle: ["idle", "walk", "run", "jump"],
  walk: ["walk", "idle"],
  run: ["run", "walk", "idle"],
  jump: ["jump", "idle"],
  talk: ["talk", "idle"],
  pray: ["pray", "idle"],
  work: ["work", "idle"],
  rest: ["rest", "idle"],
};

/** glTF clip names may be prefixed by Blender armature/action names; compare tokens, not substrings. */
function clipNameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function matchesMotionClip(clip: AnimationClip, motion: AvatarMotion): boolean {
  const tokens = clipNameTokens(clip.name);
  return CHARACTER_CLIP_ALIASES[motion].some((alias) => tokens.includes(alias));
}

/** Clamp mixer time steps after tab suspension or a dropped frame. */
export function resolveAnimationDelta(deltaSeconds: number): number {
  return Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.05)) : 0;
}

/** Find a clip explicitly authored for one motion, without runtime fallback. */
export function findDirectMotionClip(
  clips: readonly AnimationClip[],
  motion: AvatarMotion,
): AnimationClip | undefined {
  return clips.find((clip) => matchesMotionClip(clip, motion));
}

/** Runtime resolver: use the authored motion first, then a safe fallback clip. */
export function findMotionClip(
  clips: readonly AnimationClip[],
  motion: AvatarMotion,
): AnimationClip | undefined {
  for (const fallback of FALLBACKS[motion]) {
    const clip = findDirectMotionClip(clips, fallback);
    if (clip) return clip;
  }
  return undefined;
}

/** Check the distinct Blender/GLB clip contract used by player and NPC validators. */
export function findMissingCharacterMotions(
  clips: readonly AnimationClip[],
  profile: "player" | "npc",
): AvatarMotion[] {
  const required: readonly AvatarMotion[] = profile === "npc" ? NPC_REQUIRED_MOTIONS : PLAYER_REQUIRED_MOTIONS;
  return required.filter((motion) => !findDirectMotionClip(clips, motion));
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

type AvatarBoundaryProps = { fallback: ReactNode; children: ReactNode };

/** A broken or not-yet-downloaded optional GLB must not take down the whole game canvas. */
class AvatarAssetErrorBoundary extends Component<AvatarBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Suspense + error fallback wrapper for optional player/NPC character GLBs. */
export function GLBAvatarWithFallback({
  src,
  getMotion,
  fallback,
}: {
  src: string;
  getMotion: () => AvatarMotion;
  fallback: ReactNode;
}) {
  return (
    <AvatarAssetErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GLBAvatar src={src} getMotion={getMotion} />
      </Suspense>
    </AvatarAssetErrorBoundary>
  );
}
