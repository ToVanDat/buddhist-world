import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";

/**
 * Small, quality-gated cinematic pass stack. Depth of field and volumetrics
 * are intentionally excluded until focus behavior and target GPU cost are measured.
 */
export function CinematicPostProcessing() {
  const composerRef = useRef<EffectComposer | null>(null);
  const { gl, scene, camera, size } = useThree();

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      0.16,
      0.22,
      0.9,
    ));
    const vignette = new ShaderPass(VignetteShader);
    const offset = vignette.uniforms["offset"];
    const darkness = vignette.uniforms["darkness"];
    if (offset) offset.value = 1.08;
    if (darkness) darkness.value = 0.16;
    composer.addPass(vignette);
    composer.setSize(size.width, size.height);
    composerRef.current = composer;

    return () => {
      composerRef.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame((_, delta) => {
    composerRef.current?.render(delta);
  }, 1);

  return null;
}
