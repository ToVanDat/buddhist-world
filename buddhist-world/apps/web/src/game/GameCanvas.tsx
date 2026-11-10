import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { PerformanceMonitor } from "@react-three/drei";
import { DEFAULT_REGION_ID } from "@bw/shared";
import { PROFILES, stepDown } from "./rendering/quality";
import { PerformanceProbe } from "./rendering/PerformanceProbe";
import { useSettings } from "../stores/settings";
import { useNet } from "../stores/net";
import { bindKeyboard, bindOrbit } from "./core/input";
import { RegionContent } from "./world/RegionContent";
import { LightingManager } from "./lighting/LightingManager";
import { CinematicPostProcessing } from "./rendering/CinematicPostProcessing";
import { resolveLightingQuality } from "./lighting/LightingProfiles";
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
      <Canvas key={profile.antialias ? "aa" : "noaa"} shadows={profile.shadows} dpr={profile.dpr}
        gl={{ antialias: profile.antialias, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 600, position: [0, 6, 50] }}>
        <PerformanceMonitor onDecline={() => setQuality(stepDown(useSettings.getState().quality))} />
        {import.meta.env.DEV && <PerformanceProbe />}
        <LightingManager preset="day" quality={quality} />\n        {resolveLightingQuality(quality).cinematicEffects && <CinematicPostProcessing />}
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} timeStep="vary">
            <RegionContent regionId={regionId} />
            {spawn && (
              <PlayerController
                key={`${regionId}:${spawn.position.join(",")}:${spawn.yaw}`}
                start={spawn.position}
                startYaw={spawn.yaw}
              />
            )}
            <RemotePlayers />
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  );
}
