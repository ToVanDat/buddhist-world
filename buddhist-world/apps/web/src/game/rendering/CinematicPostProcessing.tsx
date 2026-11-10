import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { resolveLightingQuality } from "../lighting/LightingProfiles";
import type { Quality } from "./quality";

export function CinematicPostProcessing({ quality }: { quality: Quality }) {
  const composerRef = useRef<EffectComposer | null>(null);
  const { gl, scene, camera, size } = useThree();
  const budget = resolveLightingQuality(quality);

  useEffect(() => {
    if (!budget.cinematicEffects) return;
    const composer = new EffectComposer(gl);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.postProcessPixelRatio));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      budget.bloomStrength,
      0.22,
      0.9,
    ));
    const vignette = new ShaderPass(VignetteShader);
    const offset = vignette.uniforms["offset"];
    const darkness = vignette.uniforms["darkness"];
    if (offset) offset.value = quality === "ULTRA" ? 1.08 : 1.12;
    if (darkness) darkness.value = quality === "ULTRA" ? 0.16 : 0.1;
    composer.addPass(vignette);
    composer.setSize(size.width, size.height);
    composerRef.current = composer;

    return () => {
      composerRef.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera, quality, budget.cinematicEffects, budget.postProcessPixelRatio, budget.bloomStrength]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame((_, delta) => {
    composerRef.current?.render(delta);
  }, 1);

  return null;
}
