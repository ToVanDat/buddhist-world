import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import { TEMPLE_LAYOUT } from "@bw/shared";
import { useSettings } from "../../stores/settings";
import { WeatherReactiveMaterial } from "../lighting/WeatherReactiveMaterial";
import { resolveLightingQuality } from "../lighting/LightingProfiles";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { resolveWaterfallMistCount, resolveWaterfallMistDistance } from "./assetQuality";
import { createOrganicRockGeometry } from "./TempleProceduralGeometry";
import { resolveWindField, type WindFieldSample } from "../lighting/WindField";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const pondVertexShader = `
  uniform float uTime;
  uniform float uRainIntensity;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWave;
  void main() {
    vUv = uv;
    vec3 p = position;
    vec2 wind = normalize(uWindDirection + vec2(0.0001));
    vec2 crossWind = vec2(-wind.y, wind.x);
    float a = dot(p.xy, wind) * 1.55 + uTime * 0.72;
    float b = dot(p.xy, crossWind) * 2.25 - uTime * 0.51;
    float c = dot(p.xy, wind + crossWind * 0.38) * 3.4 + uTime * 0.34;
    float amplitude = 0.035 + uWindStrength * 0.055 + uRainIntensity * 0.045;
    float wave = sin(a) * 0.52 + sin(b) * 0.31 + sin(c) * 0.17;
    p.z += wave * amplitude;
    vec3 localNormal = normalize(vec3(
      -cos(a) * 1.55 * 0.52 * amplitude - cos(c) * 3.4 * 0.17 * amplitude,
      -cos(b) * 2.25 * 0.31 * amplitude - cos(c) * 3.4 * 0.17 * amplitude,
      1.0
    ));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vWave = wave;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform float uOpacity;
  uniform float uRainIntensity;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWave;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float radius = length(p);
    vec2 windAxis = normalize(uWindDirection + vec2(0.0001));
    vec2 crossAxis = vec2(-windAxis.y, windAxis.x);
    float rippleA = sin(dot(p * 7.0, windAxis) + uTime * 1.25);
    float rippleB = sin(dot(p * 11.0, crossAxis) - uTime * 0.92);
    float rippleC = sin(dot(p * 18.0, windAxis + crossAxis * 0.3) + uTime * 0.55);
    float ripple = rippleA * 0.45 + rippleB * 0.32 + rippleC * 0.23;
    float shallow = smoothstep(0.12, 0.98, radius);
    float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorldPosition)), 0.0), 3.0);
    vec3 color = mix(uDeepColor, uShallowColor, clamp(shallow * 0.72 + fresnel * 0.24 + vWave * 0.1, 0.0, 1.0));
    float caustic = smoothstep(0.55, 0.96, sin(p.x * 34.0 + uTime * 0.8) * sin(p.y * 29.0 - uTime * 0.63));
    color += vec3(0.10, 0.18, 0.16) * caustic * (0.08 + uRainIntensity * 0.08);
    float glint = pow(max(0.0, dot(reflect(normalize(cameraPosition - vWorldPosition), normalize(vWorldNormal)), vec3(0.0, 1.0, 0.0))), 22.0);
    color += vec3(0.58, 0.72, 0.68) * glint * (0.12 + uWindStrength * 0.2);
    float edgeFade = 1.0 - smoothstep(0.965, 1.0, radius);
    gl_FragColor = vec4(color, uOpacity * edgeFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const waterfallFragment = `
  uniform float uTime;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float windDeflection = uWindDirection.x * uWindStrength;
    float flow = fract(vUv.y * 2.6 + uTime * 0.72 + windDeflection * 0.035);
    float streaks = pow(max(0.0, sin(vUv.x * 78.0 + windDeflection * 1.8 + sin(vUv.y * 19.0 - uTime) * 1.8)), 10.0);
    float turbulence = sin(vUv.x * 22.0 + uTime * 1.7 + windDeflection) * sin(vUv.y * 34.0 - uTime * 2.1);
    float foam = smoothstep(0.54, 0.98, streaks * 0.72 + turbulence * 0.18 + flow * 0.1);
    vec3 color = mix(uDeepColor, uShallowColor, clamp(0.30 + foam * 0.72, 0.0, 1.0));
    color = mix(color, vec3(0.88, 0.95, 0.97), foam * 0.62);
    float edgeFade = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
    gl_FragColor = vec4(color, uOpacity * edgeFade * (0.82 + foam * 0.18));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const foamVertex = `
  uniform float uTime;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float windPulse = 0.35 + 0.65 * sin(uTime * 0.8 + p.x * 0.7);
    p.x += uWindDirection.x * uWindStrength * windPulse * 0.12;
    p.y += uWindDirection.y * uWindStrength * windPulse * 0.12;
    p.y += sin(p.x * 2.2 + uTime * 1.7) * 0.035;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const foamFragment = `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float n = sin(vUv.x * 58.0 + uTime * 2.2) * sin(vUv.y * 41.0 - uTime * 1.8);
    float fleck = smoothstep(0.08, 0.72, n * 0.5 + 0.5);
    float alpha = (0.10 + fleck * 0.34) * smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
    gl_FragColor = vec4(vec3(0.82, 0.92, 0.92), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const mistVertex = `
  uniform float uTime;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float phase = position.x * 1.7 + position.z * 2.1;
    float windPulse = 0.45 + 0.55 * sin(uTime * 0.55 + phase);
    p.x += sin(uTime * 0.42 + phase) * 0.42 + uWindDirection.x * uWindStrength * windPulse * 0.65;
    p.y += mod(uTime * (0.22 + fract(phase) * 0.18) + position.y * 0.3, 1.8);
    p.z += cos(uTime * 0.36 + phase) * 0.24 + uWindDirection.y * uWindStrength * windPulse * 0.65;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(18.0 / max(1.0, -mv.z), 1.2, 5.0);
    vAlpha = 0.16 + 0.18 * sin(phase + uTime);
  }
`;

const mistFragment = `
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float alpha = (1.0 - smoothstep(0.12, 0.5, d)) * vAlpha;
    gl_FragColor = vec4(0.78, 0.88, 0.91, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function resolveRainRippleIntensity(weather: "clear" | "cloudy" | "rain" | "fog", intensity: number): number {
  return weather === "rain" && Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
}

export function resolveWaterWindInfluence(field: Pick<WindFieldSample, "directionX" | "directionZ" | "strength">) {
  const length = Math.hypot(field.directionX, field.directionZ);
  const directionX = length > 1e-6 && Number.isFinite(length) ? field.directionX / length : 1;
  const directionZ = length > 1e-6 && Number.isFinite(length) ? field.directionZ / length : 0;
  const strength = Number.isFinite(field.strength) ? Math.max(0, Math.min(1, field.strength)) : 0;
  return { directionX, directionZ, strength };
}

/** Shared-field drift strength for airborne mist and surface foam. */
export function resolveWaterborneWindDrift(
  field: Pick<WindFieldSample, "directionX" | "directionZ" | "strength" | "gust" | "turbulence">,
  responseScale = 1,
) {
  const wind = resolveWaterWindInfluence(field);
  const gust = Number.isFinite(field.gust) ? Math.max(-1, Math.min(1, field.gust)) : 0;
  const turbulence = Number.isFinite(field.turbulence) ? Math.max(-1, Math.min(1, field.turbulence)) : 0;
  const scale = Number.isFinite(responseScale) ? Math.max(0, Math.min(2, responseScale)) : 0;
  const amplitude = wind.strength * (0.65 + gust * 0.2 + turbulence * 0.1) * scale;
  return { directionX: wind.directionX, directionZ: wind.directionZ, strength: Math.max(0, amplitude) };
}

type WaterProps = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number];
  deepColor?: string;
  shallowColor?: string;
  opacity?: number;
  reflection?: boolean;
  reflectionResolution?: number;
};

function createSubdividedPondGeometry(radius: number, radialSegments = 28, angularSegments = 144): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const r = radius * ring / radialSegments;
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const angle = segment / angularSegments * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      positions.push(x, y, 0);
      uvs.push(x / (radius * 2) + 0.5, y / (radius * 2) + 0.5);
    }
  }
  for (let ring = 0; ring < radialSegments; ring += 1) {
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const next = (segment + 1) % angularSegments;
      const a = ring * angularSegments + segment;
      const b = ring * angularSegments + next;
      const c = (ring + 1) * angularSegments + segment;
      const d = (ring + 1) * angularSegments + next;
      indices.push(a, c, d, a, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function useWaterMaterial(kind: "pond" | "fall", deepColor: string, shallowColor: string, opacity: number) {
  return useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(deepColor) },
      uShallowColor: { value: new THREE.Color(shallowColor) },
      uOpacity: { value: opacity },
      uRainIntensity: { value: 0 },
      uWindDirection: { value: new THREE.Vector2(1, 0) },
      uWindStrength: { value: 0 },
    },
    vertexShader: kind === "pond" ? pondVertexShader : vertexShader,
    fragmentShader: kind === "pond" ? waterFragment : waterfallFragment,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  }), [kind, deepColor, shallowColor, opacity]);
}

function AnimatedWater({ kind, position = [0, 0, 0], rotation = [0, 0, 0], size = [10, 10], deepColor = "#123d43", shallowColor = "#579b91", opacity = 1, surfaceGeometry }: WaterProps & { kind: "pond" | "fall"; surfaceGeometry?: THREE.BufferGeometry }) {
  const material = useWaterMaterial(kind, deepColor, shallowColor, opacity);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    material.uniforms["uTime"]!.value = clock.elapsedTime;
    material.uniforms["uRainIntensity"]!.value = resolveRainRippleIntensity(snapshot?.weather ?? "clear", snapshot?.weatherIntensity ?? 0);
    const wind = resolveWaterWindInfluence(resolveWindField(snapshot?.weather ?? "clear", snapshot?.weatherIntensity ?? 0, clock.elapsedTime));
    (material.uniforms["uWindDirection"]!.value as THREE.Vector2).set(wind.directionX, wind.directionZ);
    material.uniforms["uWindStrength"]!.value = wind.strength;
  });
  return (
    <mesh position={position} rotation={rotation} material={material} geometry={surfaceGeometry} receiveShadow>
      {kind === "fall" && <planeGeometry args={size} />}
    </mesh>
  );
}

/** Pond reflection is an actual planar render target; the animated shader adds moving ripples above it. */
export function LotusPondWater({ reflection = true, reflectionResolution, ...props }: WaterProps) {
  const quality = useSettings((state) => state.quality);
  const qualityBudget = resolveLightingQuality(quality);
  const qualityResolution = qualityBudget.reflectionResolution;
  const useReflection = reflection && qualityBudget.reflections && qualityResolution > 0;
  const size = props.size ?? [10, 10];
  const position = props.position ?? [0, 0, 0];
  const rotation = props.rotation ?? [-Math.PI / 2, 0, 0];
  const pondGeometry = useMemo(() => createSubdividedPondGeometry(Math.min(size[0], size[1]) / 2), [size[0], size[1]]);
  useEffect(() => () => pondGeometry.dispose(), [pondGeometry]);
  return (
    <>
      {useReflection && (
        <mesh geometry={pondGeometry} position={position} rotation={rotation}>
          <MeshReflectorMaterial
            color={props.deepColor ?? "#123d43"}
            roughness={0.24}
            metalness={0.06}
            mirror={0.42}
            resolution={Math.min(reflectionResolution ?? qualityResolution, qualityResolution)}
            blur={[160, 48]}
            mixBlur={0.68}
            mixStrength={0.72}
            depthScale={0.58}
            minDepthThreshold={0.72}
            maxDepthThreshold={1.28}
          />
        </mesh>
      )}
      <AnimatedWater {...props} surfaceGeometry={pondGeometry}
        position={useReflection ? [position[0], position[1] + 0.009, position[2]] : position}
        kind="pond" opacity={useReflection ? (props.opacity ?? 0.72) : (props.opacity ?? 1)} />
    </>
  );
}

/** Vertical animated water curtain, aligned with a cliff face. */
export function WaterfallSheet(props: WaterProps) {
  return <AnimatedWater {...props} kind="fall" opacity={props.opacity ?? 0.9} />;
}

function WaterfallImpactFoam({ position }: { position: [number, number, number] }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindDirection: { value: new THREE.Vector2(1, 0) },
      uWindStrength: { value: 0 },
    },
    vertexShader: foamVertex,
    fragmentShader: foamFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    material.uniforms["uTime"]!.value = clock.elapsedTime;
    const wind = resolveWaterborneWindDrift(resolveWindField(snapshot?.weather ?? "clear", snapshot?.weatherIntensity ?? 0, clock.elapsedTime), 0.55);
    (material.uniforms["uWindDirection"]!.value as THREE.Vector2).set(wind.directionX, wind.directionZ);
    material.uniforms["uWindStrength"]!.value = wind.strength;
  });
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <ringGeometry args={[2.2, 4.8, 72]} />
    </mesh>
  );
}

function WaterfallMist({ position }: { position: [number, number, number] }) {
  const quality = useSettings((state) => state.quality);
  const count = resolveWaterfallMistCount(quality);
  const geometry = useMemo(() => {
    const values = new Float32Array(count * 3);
    let seed = 731;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < count; i += 1) {
      values[i * 3] = (random() - 0.5) * 7.5;
      values[i * 3 + 1] = random() * 2.6;
      values[i * 3 + 2] = (random() - 0.5) * 3.8;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(values, 3));
    return buffer;
  }, [count]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindDirection: { value: new THREE.Vector2(1, 0) },
      uWindStrength: { value: 0 },
    },
    vertexShader: mistVertex,
    fragmentShader: mistFragment,
    transparent: true,
    depthWrite: false,
  }), []);
  const pointsRef = useRef<THREE.Points>(null);
  const worldPosition = useRef(new THREE.Vector3());
  const maxDistance = resolveWaterfallMistDistance(quality);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ clock, camera }) => {
    const points = pointsRef.current;
    if (!points) return;
    points.getWorldPosition(worldPosition.current);
    const inRange = camera.position.distanceToSquared(worldPosition.current) <= maxDistance * maxDistance;
    if (points.visible !== inRange) points.visible = inRange;
    if (inRange) {
      material.uniforms["uTime"]!.value = clock.elapsedTime;
      const wind = resolveWaterborneWindDrift(resolveWindField(snapshot?.weather ?? "clear", snapshot?.weatherIntensity ?? 0, clock.elapsedTime));
      (material.uniforms["uWindDirection"]!.value as THREE.Vector2).set(wind.directionX, wind.directionZ);
      material.uniforms["uWindStrength"]!.value = wind.strength;
    }
  });
  return <points ref={pointsRef} position={position} geometry={geometry} material={material} frustumCulled={false} />;
}

/** Temporary R3F mountain-retreat set dressing until the authored waterfall GLB is registered. */
const wetRockPlacements: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [
  { position: [-5.4, 0.72, 4.8], scale: [1.5, 0.9, 1.1] },
  { position: [4.8, 0.66, 4.0], scale: [1.7, 0.8, 1.2] },
  { position: [-3.8, 0.55, 7.6], scale: [1.1, 0.65, 0.8] },
  { position: [3.5, 0.48, 7.8], scale: [1.2, 0.6, 0.8] },
];

function OrganicWaterfallRock({
  position, scale, seed, wet = false, color = "#55564f",
}: {
  position: [number, number, number];
  scale: [number, number, number];
  seed: number;
  wet?: boolean;
  color?: string;
}) {
  const geometry = useMemo(() => createOrganicRockGeometry(seed, 2), [seed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} scale={scale} castShadow receiveShadow>
      {wet
        ? <WeatherReactiveMaterial color={color} baseRoughness={0.28} baseMetalness={0.04} baseClearcoat={0.48} />
        : <meshPhysicalMaterial color={color} roughness={0.86} clearcoat={0.12} />}
    </mesh>
  );
}

export function MountainRetreatWaterfall() {
  return (
    <group position={TEMPLE_LAYOUT.anchors.waterfall}>
      <OrganicWaterfallRock position={[-5, 4.0, 0]} scale={[5.2, 5.4, 3.4]} seed={21} color="#55564f" />
      <OrganicWaterfallRock position={[5, 4.3, 0]} scale={[5.0, 5.8, 3.2]} seed={37} color="#626157" />
      <OrganicWaterfallRock position={[0, 8.0, 0]} scale={[7.0, 2.2, 3.6]} seed={53} color="#4f514b" />
      <WaterfallSheet position={[0, 4.0, 1.85]} size={[6.6, 8.0]} deepColor="#174b54" shallowColor="#a8d0d2" opacity={0.86} />
      <LotusPondWater
        position={[0, 0.10, 5.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={[10, 10]}
        deepColor="#123b43"
        shallowColor="#5b9a99"
        reflection={false}
        opacity={0.94}
      />
      <WaterfallImpactFoam position={[0, 0.13, 5.2]} />
      <WaterfallMist position={[0, 0.42, 4.2]} />
      {wetRockPlacements.map(({ position, scale }, index) => (
        <OrganicWaterfallRock key={index} position={position} scale={scale} seed={71 + index * 13} wet />
      ))}
      <OrganicWaterfallRock position={[0, 0.18, 3.2]} scale={[3.4, 0.34, 0.8]} seed={131} wet color="#233b37" />
    </group>
  );
}
