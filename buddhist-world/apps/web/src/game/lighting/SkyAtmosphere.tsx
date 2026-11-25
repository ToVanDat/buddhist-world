import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldEnvironmentSnapshot } from "@bw/shared";
import { resolveCelestialDirections, resolveWorldMinute } from "./CelestialCycle";

export interface SkyAtmosphereProps {
  enabled?: boolean;
  snapshot: WorldEnvironmentSnapshot | null;
  receivedAt: number | null;
}

const vertexShader = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec3 vDirection;
  uniform vec3 sunDirection;
  uniform float daylight;
  uniform float cloudCoverage;
  uniform float time;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float elevation = max(direction.y, 0.0);
    vec3 nightZenith = vec3(0.012, 0.022, 0.052);
    vec3 dayZenith = vec3(0.12, 0.31, 0.52);
    vec3 nightHorizon = vec3(0.045, 0.075, 0.12);
    vec3 dayHorizon = vec3(0.62, 0.72, 0.78);
    vec3 zenith = mix(nightZenith, dayZenith, daylight);
    vec3 horizon = mix(nightHorizon, dayHorizon, daylight);
    vec3 color = mix(horizon, zenith, pow(elevation, 0.62));

    float sunDot = max(dot(direction, normalize(sunDirection)), 0.0);
    float sunsetBand = (1.0 - smoothstep(0.08, 0.42, daylight)) * smoothstep(0.0, 0.15, elevation);
    color += vec3(1.0, 0.43, 0.19) * pow(sunDot, 5.0) * sunsetBand * 0.38;
    color += vec3(1.0, 0.83, 0.62) * pow(sunDot, 42.0) * daylight * 0.75;

    vec2 cloudUv = direction.xz / max(0.22, direction.y + 0.22);
    float cloudNoise = noise(cloudUv * 5.2 + vec2(time * 0.003, time * 0.0012));
    float cloudMask = smoothstep(0.52, 0.78, cloudNoise) * smoothstep(0.015, 0.3, elevation);
    color = mix(color, vec3(0.76, 0.81, 0.84), cloudMask * cloudCoverage * 0.62);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function resolveCloudCoverage(weather: WorldEnvironmentSnapshot["weather"], intensity: number): number {
  const amount = THREE.MathUtils.clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
  if (weather === "rain") return 0.92;
  if (weather === "cloudy") return 0.82;
  if (weather === "fog") return 0.38;
  return 0.16 + amount * 0.08;
}

/** A continuously updated sky dome, cloud field and night-sky star layer. */
export function SkyAtmosphere({
  enabled = true,
  snapshot,
  receivedAt,
}: SkyAtmosphereProps) {
  const skyMaterial = useRef<THREE.ShaderMaterial>(null);
  const starMaterial = useRef<THREE.PointsMaterial>(null);
  const stars = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 560;
    const positions = new Float32Array(count * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < count; index += 1) {
      const y = 0.035 + 0.965 * ((index + 0.5) / count);
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = index * goldenAngle;
      positions[index * 3] = Math.cos(angle) * radius * 430;
      positions[index * 3 + 1] = y * 430;
      positions[index * 3 + 2] = Math.sin(angle) * radius * 430;
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return result;
  }, []);
  const uniforms = useMemo(() => ({
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    daylight: { value: 1 },
    cloudCoverage: { value: 0.2 },
    time: { value: 0 },
  }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const celestial = resolveCelestialDirections(resolveWorldMinute(snapshot, receivedAt));
    if (skyMaterial.current) {
      skyMaterial.current.uniforms.sunDirection.value.set(...celestial.sun);
      skyMaterial.current.uniforms.daylight.value = celestial.daylight;
      skyMaterial.current.uniforms.cloudCoverage.value = resolveCloudCoverage(
        snapshot?.weather ?? "clear",
        snapshot?.weatherIntensity ?? 0,
      );
      skyMaterial.current.uniforms.time.value = clock.elapsedTime;
    }
    if (starMaterial.current) {
      starMaterial.current.opacity = celestial.night * 0.92;
    }
    if (stars.current) stars.current.rotation.y = clock.elapsedTime * 0.0008;
  });

  if (!enabled) return null;
  return (
    <group name="dynamic-sky-atmosphere">
      <mesh renderOrder={-1000} frustumCulled={false}>
        <sphereGeometry args={[480, 48, 32]} />
        <shaderMaterial
          ref={skyMaterial}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
        />
      </mesh>
      <points ref={stars} geometry={geometry} renderOrder={-999} frustumCulled={false}>
        <pointsMaterial
          ref={starMaterial}
          color="#dce8ff"
          size={1.45}
          sizeAttenuation={false}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
