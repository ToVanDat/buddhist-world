import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { PerformanceMonitor, Sky } from "@react-three/drei";
import { DEFAULT_REGION_ID } from "@bw/shared";
import { PROFILES, stepDown } from "./rendering/quality";
import { PerformanceProbe } from "./rendering/PerformanceProbe";
import { useSettings } from "../stores/settings";
import { useNet } from "../stores/net";
import { bindKeyboard, bindOrbit } from "./core/input";
import { RegionContent } from "./world/RegionContent";
import { PlayerController } from "./characters/PlayerController";
import { RemotePlayers } from "./characters/RemotePlayers";

export function GameCanvas() {
  const quality = useSettings((s) => s.quality);
  const setQuality = useSettings((s) => s.setQuality);
  const spawn = useNet((s) => s.spawn);
  const regionId = useNet((s) => s.regionId) ?? DEFAULT_REGION_ID;
  const profile = PROFILES[quality];
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => bindKeyboard(), []);
  useEffect(() => (el ? bindOrbit(el, () => useSettings.getState().lookSensitivity) : undefined), [el]);

  return (
    <div className="stage" ref={setEl}>
      {/* key=quality: đổi antialias cần tạo lại context. Hạ cấp tự động chỉ xảy ra hiếm. */}
      <Canvas key={profile.antialias ? "aa" : "noaa"} shadows={profile.shadows} dpr={profile.dpr}
        gl={{ antialias: profile.antialias, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 600, position: [0, 6, 50] }}>
        <PerformanceMonitor onDecline={() => setQuality(stepDown(useSettings.getState().quality))} />
        {import.meta.env.DEV && <PerformanceProbe />}
        <color attach="background" args={["#b8c4c8"]} />
        {profile.fog && <fog attach="fog" args={["#b8c4c8", 40, 260]} />}
        <Sky sunPosition={[60, 35, 30]} turbidity={6} rayleigh={1.2} />
        <hemisphereLight args={["#dfe8ef", "#5c5a45", 0.7]} />
        <directionalLight position={[60, 80, 40]} intensity={2.2} castShadow={profile.shadows}
          shadow-mapSize={[profile.shadowMapSize, profile.shadowMapSize]}
          shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60}
          shadow-camera-near={1} shadow-camera-far={220} shadow-bias={-0.0005} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} timeStep="vary">
            <RegionContent regionId={regionId} />
            {spawn && <PlayerController start={spawn.position} startYaw={spawn.yaw} />}
            <RemotePlayers />
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  );
}
