import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { resolveLightingQuality } from "../lighting/LightingProfiles";
import { resolveVolumetricFogParameters } from "./volumetricFog";
import type { Quality } from "./quality";

const VolumetricFogShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 600 },
    projectionMatrixInverse: { value: new THREE.Matrix4() },
    cameraMatrixWorld: { value: new THREE.Matrix4() },
    uFogColor: { value: new THREE.Color("#aeb8bd") },
    uFogDensity: { value: 0 },
    uFogSteps: { value: 8 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform mat4 projectionMatrixInverse;
    uniform mat4 cameraMatrixWorld;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform float uFogSteps;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec4 sceneColor = texture2D(tDiffuse, vUv);
      float depth = texture2D(tDepth, vUv).x;
      if (depth >= 0.999999 || uFogDensity <= 0.00001) {
        gl_FragColor = sceneColor;
        return;
      }
      vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 viewPosition = projectionMatrixInverse * clip;
      viewPosition /= max(viewPosition.w, 0.00001);
      vec3 worldPosition = (cameraMatrixWorld * viewPosition).xyz;
      vec3 cameraPositionWorld = cameraMatrixWorld[3].xyz;
      vec3 rayVector = worldPosition - cameraPositionWorld;
      float rayLength = length(rayVector);
      vec3 rayDirection = rayVector / max(rayLength, 0.0001);
      float stepLength = rayLength / max(uFogSteps, 1.0);
      float transmittance = 1.0;
      vec3 scattered = vec3(0.0);
      for (int i = 0; i < 16; i++) {
        if (float(i) >= uFogSteps) break;
        vec3 samplePosition = cameraPositionWorld + rayDirection * ((float(i) + 0.5) * stepLength);
        float heightFalloff = exp(-max(samplePosition.y, 0.0) * 0.012);
        float variation = 0.94 + 0.06 * sin(dot(samplePosition.xz, vec2(0.071, 0.053)) + uTime * 0.12);
        float localDensity = uFogDensity * heightFalloff * variation;
        float sampleTransmittance = exp(-localDensity * stepLength);
        scattered += uFogColor * (1.0 - sampleTransmittance) * transmittance;
        transmittance *= sampleTransmittance;
      }
      gl_FragColor = vec4(sceneColor.rgb * transmittance + scattered, sceneColor.a);
    }
  `,
};

export function CinematicPostProcessing({ quality }: { quality: Quality }) {
  const composerRef = useRef<EffectComposer | null>(null);
  const fogPassRef = useRef<ShaderPass | null>(null);
  const { gl, scene, camera, size } = useThree();
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const budget = resolveLightingQuality(quality);

  useEffect(() => {
    if (!budget.cinematicEffects) return;
    const composer = new EffectComposer(gl);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.postProcessPixelRatio));
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      target.depthTexture = new THREE.DepthTexture(size.width, size.height, THREE.UnsignedIntType);
    }
    composer.addPass(new RenderPass(scene, camera));

    if (budget.volumetricFog) {
      const fogPass = new ShaderPass(VolumetricFogShader);
      fogPassRef.current = fogPass;
      composer.addPass(fogPass);
    }

    if (budget.depthOfField) {
      composer.addPass(new BokehPass(scene, camera, {
        focus: 32,
        aperture: 0.000015,
        maxblur: 0.003,
      }));
    }

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
      fogPassRef.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera, quality, budget.cinematicEffects, budget.postProcessPixelRatio, budget.bloomStrength, budget.volumetricFog, budget.depthOfField, size.width, size.height]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame(({ clock }, delta) => {
    const composer = composerRef.current;
    const fogPass = fogPassRef.current;
    if (composer && fogPass) {
      const parameters = resolveVolumetricFogParameters(
        quality,
        snapshot?.weather ?? "clear",
        snapshot?.weatherIntensity ?? 0,
      );
      fogPass.uniforms["tDepth"]!.value = composer.readBuffer.depthTexture;
      fogPass.uniforms["cameraNear"]!.value = camera.near;
      fogPass.uniforms["cameraFar"]!.value = camera.far;
      fogPass.uniforms["projectionMatrixInverse"]!.value.copy(camera.projectionMatrixInverse);
      fogPass.uniforms["cameraMatrixWorld"]!.value.copy(camera.matrixWorld);
      (fogPass.uniforms["uFogColor"]!.value as THREE.Color).set(parameters.color);
      fogPass.uniforms["uFogDensity"]!.value = parameters.enabled ? parameters.density : 0;
      fogPass.uniforms["uFogSteps"]!.value = parameters.steps;
      fogPass.uniforms["uTime"]!.value = clock.elapsedTime;
    }
    composer?.render(delta);
  }, 1);

  return null;
}
