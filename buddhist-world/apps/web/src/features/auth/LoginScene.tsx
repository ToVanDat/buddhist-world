import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { CinematicOpening } from "./CinematicOpening";

function CameraDrift() {
  const lookAt = useRef(new THREE.Vector3(0, 3.2, -9));
  const target = useRef(new THREE.Vector3());
  useFrame(({ camera, clock, pointer }) => {
    const t = clock.elapsedTime;
    const progress = Math.min(1, t / 4.8);
    const cinematicEase = 1 - Math.pow(1 - progress, 3);
    const introZ = THREE.MathUtils.lerp(29, 20, cinematicEase);
    target.current.set(
      Math.sin(t * 0.075) * 0.72 + pointer.x * 0.72,
      5.15 + Math.sin(t * 0.11) * 0.16 + pointer.y * 0.28,
      introZ + Math.cos(t * 0.06) * 0.35
    );
    camera.position.lerp(target.current, 0.022);
    camera.lookAt(lookAt.current.x + pointer.x * 0.42, lookAt.current.y + pointer.y * 0.18, lookAt.current.z);
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
  const crown = useRef<THREE.Group>(null);
  const leaves = useMemo(() => Array.from({ length: 25 }, (_, i) => {
    const a = i * 2.399, r = 1.1 + (i % 4) * 0.34;
    return { x: Math.cos(a) * r, y: 4.1 + (i % 5) * 0.38, z: Math.sin(a) * r, s: 0.8 + (i % 3) * 0.2, color: i % 3 === 0 ? "#536e4c" : "#657c50" };
  }), []);
  useFrame(({ clock }) => {
    if (crown.current) {
      crown.current.rotation.z = Math.sin(clock.elapsedTime * 0.4 + position[0]) * 0.018;
      crown.current.rotation.x = Math.cos(clock.elapsedTime * 0.3 + position[2]) * 0.014;
    }
  });
  return <group position={position}>
    <mesh position={[0, 2.3, 0]} castShadow><cylinderGeometry args={[0.28, 0.55, 4.6, 12]} /><meshStandardMaterial color="#51402e" roughness={1} /></mesh>
    <group ref={crown}>{leaves.map((leaf, i) => <mesh key={i} position={[leaf.x, leaf.y, leaf.z]} scale={[leaf.s * 1.25, leaf.s * 0.82, leaf.s]} castShadow>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={leaf.color} roughness={0.94} flatShading />
    </mesh>)}</group>
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

function WaterSurface() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color("#315b59") } }), []);
  useFrame(({ clock }) => { if (material.current) material.current.uniforms["uTime"]!.value = clock.elapsedTime; });
  return <mesh rotation-x={-Math.PI / 2} position={[-11, 0.045, 2]}>
    <circleGeometry args={[7.2, 96]} />
    <shaderMaterial ref={material} uniforms={uniforms} transparent vertexShader={`
      uniform float uTime; varying vec2 vUv; varying float vWave;
      void main(){ vUv=uv; vec3 p=position; float d=length(p.xy);
      float w=sin(d*7.0-uTime*1.35)*0.018+sin(p.x*3.2+uTime*.7)*.009;
      p.z+=w; vWave=w; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`} fragmentShader={`
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying float vWave;
      void main(){ float r=.5+.5*sin(length(vUv-.5)*95.0-uTime*1.7);
      float glint=smoothstep(.88,1.0,r)*.2; vec3 c=uColor+vec3(.24,.22,.14)*glint+vec3(vWave*1.8);
      gl_FragColor=vec4(c,.94); }`} />
  </mesh>;
}

function MistLayer({ position, width, opacity, speed }: { position: [number, number, number]; width: number; opacity: number; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.x = position[0] + Math.sin(clock.elapsedTime * speed) * 1.4; });
  return <mesh ref={ref} position={position} scale={[width, 2.2, 1]}>
    <planeGeometry args={[1, 1]} /><meshBasicMaterial color="#e4e7d8" transparent opacity={opacity} depthWrite={false} />
  </mesh>;
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
    <WaterSurface />
    {[-14, -11, -8].map((x, i) => <Lotus key={i} position={[x, 0.08, 0.2 + (i % 2) * 2]} scale={0.8 + i * 0.12} />)}
    <BodhiTree position={[12, 0, -7]} />
    <BodhiTree position={[-15, 0, -15]} />
    <TempleGate />
    <MainHall />
    <MistLayer position={[-10, 1.8, -22]} width={25} opacity={0.11} speed={0.025} />
    <MistLayer position={[9, 2.2, -29]} width={30} opacity={0.09} speed={0.018} />
    <Sparkles count={90} scale={[34, 10, 38]} size={1.8} speed={0.12} opacity={0.35} color="#f3dfb7" />
    <CameraDrift />
  </>;
}

function AmbienceControl() {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);
  function ring(ctx: AudioContext, master: GainNode) {
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type="sine"; osc.frequency.setValueAtTime(528,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(264,ctx.currentTime+3.2);
    gain.gain.setValueAtTime(.0001,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.1,ctx.currentTime+.04); gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+5.5);
    osc.connect(gain); gain.connect(master); osc.start(); osc.stop(ctx.currentTime+5.6);
  }
  async function toggle() {
    if(enabled){ if(timer.current!==null) window.clearInterval(timer.current); timer.current=null; await context.current?.close(); context.current=null; setEnabled(false); return; }
    if(!window.AudioContext) return;
    const ctx=new AudioContext(); await ctx.resume();
    const master=ctx.createGain(); master.gain.value=.18; master.connect(ctx.destination);
    const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate), data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*.22;
    const src=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), wind=ctx.createGain();
    src.buffer=buffer; src.loop=true; filter.type="lowpass"; filter.frequency.value=420; wind.gain.value=.12;
    src.connect(filter); filter.connect(wind); wind.connect(master); src.start();
    context.current=ctx; ring(ctx,master); timer.current=window.setInterval(()=>ring(ctx,master),24000); setEnabled(true);
  }
  useEffect(()=>()=>{ if(timer.current!==null) window.clearInterval(timer.current); void context.current?.close(); },[]);
  return <button className="ambience-toggle" type="button" onClick={()=>void toggle()} aria-pressed={enabled}>{enabled ? "♫ ÂM THANH: BẬT" : "♪ BẬT ÂM THANH"}</button>;
}

export function LoginScene() {
  const [lowQuality,setLowQuality]=useState(false);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    setLowQuality(window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 720px)").matches);
    const q=window.matchMedia("(prefers-reduced-motion: reduce)");
    const update=()=>setReduced(q.matches); update(); q.addEventListener?.("change",update);
    return ()=>q.removeEventListener?.("change",update);
  },[]);
  return <div className="login-world">
    <Canvas shadows={!lowQuality} dpr={lowQuality?[0.7,1]:[1,1.5]} frameloop={reduced?"demand":"always"} camera={{position:[0,5.2,29],fov:48,near:.1,far:160}}>
      <World />
    </Canvas>
    <div className="login-world-vignette" />
    <CinematicOpening />
    <AmbienceControl />
  </div>;
}
