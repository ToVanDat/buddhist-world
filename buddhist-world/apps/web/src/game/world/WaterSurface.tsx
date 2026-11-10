import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

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
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float waveA = sin(p.x * 13.0 + uTime * 0.75) * cos(p.y * 9.0 - uTime * 0.55);
    float waveB = sin((p.x + p.y) * 23.0 - uTime * 1.25);
    float ripple = waveA * 0.035 + waveB * 0.012;
    float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0)), 0.0), 2.0);
    float depthMix = clamp(0.32 + ripple + fresnel * 0.3, 0.0, 1.0);
    vec3 color = mix(uDeepColor, uShallowColor, depthMix);
    float caustic = smoothstep(0.78, 0.98, sin(p.x * 31.0 + uTime) * sin(p.y * 27.0 - uTime * 0.8));
    color += vec3(0.10, 0.16, 0.13) * caustic * 0.16;
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
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  void main() {
    float flow = fract(vUv.y * 2.6 - uTime * 0.72);
    float streaks = pow(max(0.0, sin(vUv.x * 78.0 + sin(vUv.y * 19.0 - uTime) * 1.8)), 10.0);
    float turbulence = sin(vUv.x * 22.0 + uTime * 1.7) * sin(vUv.y * 34.0 - uTime * 2.1);
    float foam = smoothstep(0.62, 0.98, streaks * 0.72 + turbulence * 0.18 + flow * 0.1);
    vec3 color = mix(uDeepColor, uShallowColor, clamp(0.35 + foam * 0.7, 0.0, 1.0));
    color = mix(color, vec3(0.86, 0.94, 0.96), foam * 0.58);
    gl_FragColor = vec4(color, uOpacity * (0.82 + foam * 0.18));
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

function AnimatedWater({ kind, position = [0, 0, 0], rotation = [0, 0, 0], size = [10, 10], deepColor = "#123d43", shallowColor = "#579b91", opacity = 0.88 }: WaterProps & { kind: "pond" | "fall" }) {
  const material = useWaterMaterial(kind, deepColor, shallowColor, opacity);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={position} rotation={rotation} material={material} receiveShadow>
      <planeGeometry args={size} />
    </mesh>
  );
}

/** Horizontal animated water plane. Place beneath lotus pads and shoreline meshes. */
export function LotusPondWater(props: WaterProps) {
  return <AnimatedWater {...props} kind="pond" />;
}

/** Vertical animated sheet. Rotate/position it to follow the waterfall cliff. */
export function WaterfallSheet(props: WaterProps) {
  return <AnimatedWater {...props} kind="fall" opacity={props.opacity ?? 0.9} />;
}
