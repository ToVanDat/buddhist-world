import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";

function CameraDrift() {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.12) * 0.65;
    camera.position.y = 5.2 + Math.sin(t * 0.18) * 0.16;
    camera.position.z = 19 + Math.sin(t * 0.1) * 0.35;
    camera.lookAt(0, 3.2, -9);
  });
  return null;
}

function Mountain({ position, scale, color }: { position: [number, number, number]; scale: [number, number, number]; color: string }) {
  return <mesh position={position} scale={scale} castShadow receiveShadow>
    <coneGeometry args={[1, 2, 7]} />
    <meshStandardMaterial color={color} roughness={1} flatShading />
  </mesh>;
}

function Pillar({ position, height = 5.4 }: { position: [number, number, number]; height?: number }) {
  return <mesh position={position} castShadow receiveShadow>
    <cylinderGeometry args={[0.28, 0.38, height, 12]} />
    <meshStandardMaterial color="#75533a" roughness={0.72} />
  </mesh>;
}

function Roof({ position, width, depth }: { position: [number, number, number]; width: number; depth: number }) {
  return <group position={position}>
    <mesh castShadow rotation={[0, 0, 0]}>
      <boxGeometry args={[width, 0.32, depth]} />
      <meshStandardMaterial color="#3c2925" roughness={0.62} />
    </mesh>
    <mesh position={[0, 0.18, 0]} scale={[width * 0.55, 0.45, depth * 0.52]} castShadow>
      <coneGeometry args={[1, 1, 4]} />
      <meshStandardMaterial color="#694238" roughness={0.68} />
    </mesh>
  </group>;
}

function BodhiTree({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh position={[0, 2.3, 0]} castShadow>
      <cylinderGeometry args={[0.28, 0.55, 4.6, 9]} />
      <meshStandardMaterial color="#51402e" roughness={1} />
    </mesh>
    {Array.from({ length: 11 }, (_, i) => {
      const a = i * 2.399;
      const r = 1.2 + (i % 3) * 0.32;
      return <mesh key={i} position={[Math.cos(a) * r, 4.4 + (i % 4) * 0.48, Math.sin(a) * r]} scale={[1.5, 1.05, 1.35]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={i % 3 === 0 ? "#536b48" : "#657c50"} roughness={0.95} flatShading />
      </mesh>;
    })}
  </group>;
}

function TempleGate() {
  return <group position={[0, 0, 1]}>
    {[-5.4, -1.8, 1.8, 5.4].map((x, i) => <Pillar key={i} position={[x, 2.7, 0]} height={i === 1 || i === 2 ? 6.2 : 5.4} />)}
    <mesh position={[0, 5.9, 0]} castShadow>
      <boxGeometry args={[13, 0.5, 2.2]} />
      <meshStandardMaterial color="#73503b" roughness={0.7} />
    </mesh>
    <Roof position={[0, 6.45, 0]} width={14.5} depth={3.1} />
    <mesh position={[0, 7.35, 0]} castShadow>
      <boxGeometry args={[3.2, 0.35, 1.2]} />
      <meshStandardMaterial color="#b28c55" metalness={0.25} roughness={0.55} />
    </mesh>
  </group>;
}

function MainHall() {
  return <group position={[0, 0, -19]}>
    <mesh position={[0, 2.2, -1]} castShadow receiveShadow>
      <boxGeometry args={[15, 4.4, 9]} />
      <meshStandardMaterial color="#b6a184" roughness={0.9} />
    </mesh>
    {[-6, -3, 0, 3, 6].map((x) => <Pillar key={x} position={[x, 2.5, 3.7]} height={5} />)}
    <Roof position={[0, 5, -1]} width={18} depth={12} />
    <mesh position={[0, 2.6, 3.58]}>
      <boxGeometry args={[2.1, 2.8, 0.08]} />
      <meshStandardMaterial color="#4a3327" roughness={0.8} />
    </mesh>
  </group>;
}

function Lotus({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
      <circleGeometry args={[0.38, 9]} />
      <meshStandardMaterial color="#d8a7a0" roughness={0.65} side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[0, 0.18, 0]}>
      <sphereGeometry args={[0.12, 10, 8]} />
      <meshStandardMaterial color="#d9b66c" roughness={0.5} />
    </mesh>
  </group>;
}

function World() {
  return <>
    <color attach="background" args={["#a8b5ad"]} />
    <fog attach="fog" args={["#b5c0b5", 24, 78]} />
    <ambientLight intensity={0.68} color="#d8e0d4" />
    <hemisphereLight args={["#dce8e7", "#4a5140", 1.15]} />
    <directionalLight position={[-12, 18, 9]} intensity={2.25} color="#ffe1ae" castShadow shadow-mapSize={[2048, 2048]} />
    <pointLight position={[0, 5, -12]} intensity={22} distance={28} color="#e5b879" />
    <Mountain position={[-19, 4, -31]} scale={[12, 13, 8]} color="#778675" />
    <Mountain position={[-7, 3, -36]} scale={[13, 10, 8]} color="#899787" />
    <Mountain position={[10, 4, -38]} scale={[15, 14, 9]} color="#718273" />
    <Mountain position={[23, 2, -30]} scale={[12, 11, 8]} color="#8b9682" />
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.12, -8]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color="#667458" roughness={1} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[-11, 0.02, 2]}>
      <circleGeometry args={[7, 64]} />
      <meshStandardMaterial color="#405f5c" roughness={0.18} metalness={0.2} />
    </mesh>
    {[-14, -11, -8].map((x, i) => <Lotus key={i} position={[x, 0.08, 0.2 + (i % 2) * 2]} scale={0.8 + i * 0.12} />)}
    <BodhiTree position={[12, 0, -7]} />
    <BodhiTree position={[-15, 0, -15]} />
    <TempleGate />
    <MainHall />
    <Sparkles count={90} scale={[34, 10, 38]} size={2.2} speed={0.18} opacity={0.42} color="#f3dfb7" />
    <CameraDrift />
  </>;
}

export function LoginScene() {
  const container = useRef<HTMLDivElement>(null);
  return <div className="login-world" ref={container} aria-hidden="true">
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 5.2, 19], fov: 48, near: 0.1, far: 160 }}>
      <World />
    </Canvas>
    <div className="login-world-vignette" />
  </div>;
}
