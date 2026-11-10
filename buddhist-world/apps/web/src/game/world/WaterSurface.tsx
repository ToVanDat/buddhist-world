import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import { useSettings } from "../../stores/settings";
import { WeatherReactiveMaterial } from "../lighting/WeatherReactiveMaterial";
import { resolveLightingQuality } from "../lighting/LightingProfiles";

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

const waterFragment = `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float waveA = sin(p.x * 13.0 + uTime * 0.75) * cos(p.y * 9.0 - uTime * 0.55);
    float waveB = sin((p.x + p.y) * 23.0 - uTime * 1.25);
    float ripple = waveA * 0.035 + waveB * 0.012;
    float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0)), 0.0), 2.0);
    float depthMix = clamp(0.30 + ripple + fresnel * 0.24, 0.0, 1.0);
    vec3 color = mix(uDeepColor, uShallowColor, depthMix);
    float caustic = smoothstep(0.76, 0.98, sin(p.x * 31.0 + uTime) * sin(p.y * 27.0 - uTime * 0.8));
    color += vec3(0.10, 0.16, 0.13) * caustic * 0.14;
    gl_FragColor = vec4(color, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const waterfallFragment = `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float flow = fract(vUv.y * 2.6 + uTime * 0.72);
    float streaks = pow(max(0.0, sin(vUv.x * 78.0 + sin(vUv.y * 19.0 - uTime) * 1.8)), 10.0);
    float turbulence = sin(vUv.x * 22.0 + uTime * 1.7) * sin(vUv.y * 34.0 - uTime * 2.1);
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
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
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
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float phase = position.x * 1.7 + position.z * 2.1;
    p.x += sin(uTime * 0.42 + phase) * 0.42;
    p.y += mod(uTime * (0.22 + fract(phase) * 0.18) + position.y * 0.3, 1.8);
    p.z += cos(uTime * 0.36 + phase) * 0.24;
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

function useWaterMaterial(kind: "pond" | "fall", deepColor: string, shallowColor: string, opacity: number) {
  return useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(deepColor) },
      uShallowColor: { value: new THREE.Color(shallowColor) },
      uOpacity: { value: opacity },
    },
    vertexShader,
    fragmentShader: kind === "pond" ? waterFragment : waterfallFragment,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  }), [kind, deepColor, shallowColor, opacity]);
}

function AnimatedWater({ kind, position = [0, 0, 0], rotation = [0, 0, 0], size = [10, 10], deepColor = "#123d43", shallowColor = "#579b91", opacity = 1 }: WaterProps & { kind: "pond" | "fall" }) {
  const material = useWaterMaterial(kind, deepColor, shallowColor, opacity);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => { material.uniforms["uTime"]!.value = clock.elapsedTime; });
  return (
    <mesh position={position} rotation={rotation} material={material} receiveShadow>
      {kind === "pond" ? <circleGeometry args={[size[0] / 2, 64]} /> : <planeGeometry args={size} />}
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
  return (
    <>
      {useReflection && (
        <mesh position={position} rotation={rotation}>
          <circleGeometry args={[size[0] / 2, 64]} />
          <MeshReflectorMaterial
            color={props.deepColor ?? "#123d43"}
            roughness={0.2}
            metalness={0.08}
            mirror={0.32}
            resolution={reflectionResolution ?? qualityResolution}
            blur={[240, 80]}
            mixBlur={0.82}
            mixStrength={0.58}
            depthScale={0.42}
            minDepthThreshold={0.8}
            maxDepthThreshold={1.2}
          />
        </mesh>
      )}
      <AnimatedWater {...props} position={useReflection ? [position[0], position[1] + 0.008, position[2]] : position} kind="pond" opacity={useReflection ? (props.opacity ?? 0.22) : (props.opacity ?? 1)} />
    </>
  );
}

/** Vertical animated water curtain, aligned with a cliff face. */
export function WaterfallSheet(props: WaterProps) {
  return <AnimatedWater {...props} kind="fall" opacity={props.opacity ?? 0.9} />;
}

function WaterfallImpactFoam({ position }: { position: [number, number, number] }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: foamVertex,
    fragmentShader: foamFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => { material.uniforms["uTime"]!.value = clock.elapsedTime; });
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <ringGeometry args={[2.2, 4.8, 72]} />
    </mesh>
  );
}

function WaterfallMist({ position }: { position: [number, number, number] }) {
  const geometry = useMemo(() => {
    const count = 120;
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
  }, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: mistVertex,
    fragmentShader: mistFragment,
    transparent: true,
    depthWrite: false,
  }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ clock }) => { material.uniforms["uTime"]!.value = clock.elapsedTime; });
  return <points position={position} geometry={geometry} material={material} frustumCulled={false} />;
}

/** Temporary R3F mountain-retreat set dressing until the authored waterfall GLB is registered. */
const wetRockPlacements: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [
  { position: [-29.4, 0.72, -101.2], scale: [1.5, 0.9, 1.1] },
  { position: [-19.2, 0.66, -102.0], scale: [1.7, 0.8, 1.2] },
  { position: [-27.8, 0.55, -98.4], scale: [1.1, 0.65, 0.8] },
  { position: [-20.5, 0.48, -98.2], scale: [1.2, 0.6, 0.8] },
];

export function MountainRetreatWaterfall() {
  return (
    <group>
      <mesh position={[-29, 4.0, -106]} scale={[5.2, 5.4, 3.4]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial color="#55564f" roughness={0.86} clearcoat={0.12} />
      </mesh>
      <mesh position={[-19, 4.3, -106]} scale={[5.0, 5.8, 3.2]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial color="#626157" roughness={0.82} clearcoat={0.16} />
      </mesh>
      <mesh position={[-24, 8.0, -106]} scale={[7.0, 2.2, 3.6]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial color="#4f514b" roughness={0.9} />
      </mesh>
      <WaterfallSheet position={[-24, 4.0, -104.15]} size={[6.6, 8.0]} deepColor="#174b54" shallowColor="#a8d0d2" opacity={0.86} />
      <LotusPondWater
        position={[-24, 0.10, -100.8]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={[10, 10]}
        deepColor="#123b43"
        shallowColor="#5b9a99"
        reflection={false}
        opacity={0.94}
      />
      <WaterfallImpactFoam position={[-24, 0.13, -100.8]} />
      <WaterfallMist position={[-24, 0.42, -101.8]} />
      {wetRockPlacements.map(({ position, scale }, index) => (
        <mesh key={index} position={position} scale={scale} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 1]} />
          <WeatherReactiveMaterial color="#424a43" baseRoughness={0.28} baseMetalness={0.04} baseClearcoat={0.48} />
        </mesh>
      ))}
      <mesh position={[-24, 0.18, -102.8]} scale={[3.4, 0.34, 0.8]} receiveShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <WeatherReactiveMaterial color="#233b37" baseRoughness={0.24} baseClearcoat={0.58} />
      </mesh>
    </group>
  );
}
