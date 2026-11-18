import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { WorldLoading } from "./rendering/WorldLoading";
import { DEFAULT_REGION_ID } from "@bw/shared";
import { detectHardwareCapabilities, resolveQualityProfile } from "./rendering/quality";
import { AdaptiveQualityMonitor } from "./rendering/AdaptiveQualityMonitor";
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
import { RainWeatherEffect } from "./rendering/RainWeatherEffect";
import { FogWeatherEffect } from "./rendering/FogWeatherEffect";
import { WorldAudioManager } from "./audio/WorldAudioManager";
import { WorldIntroVideo } from "./cinematics/WorldIntroVideo";

const WORLD_AMBIENCE_URL = import.meta.env.VITE_WORLD_AMBIENCE_URL?.trim() ?? "";
const WORLD_INTRO_VIDEO_URL = import.meta.env.VITE_WORLD_INTRO_VIDEO_URL?.trim() ?? "";

export function GameCanvas() {
  const quality = useSettings((s) => s.quality);
  const audioVolume = useSettings((s) => s.audioVolume);
  const qualityMode = useSettings((s) => s.qualityMode);
  const setAdaptiveQuality = useSettings((s) => s.setAdaptiveQuality);
  const spawn = useNet((s) => s.spawn);
  const regionId = useNet((s) => s.regionId) ?? DEFAULT_REGION_ID;
  const capabilities = useMemo(() => detectHardwareCapabilities(), []);
  const profile = resolveQualityProfile(quality, capabilities);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [rendererCanvas, setRendererCanvas] = useState<HTMLCanvasElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => bindKeyboard(), []);
  useEffect(() => {
    if (!rendererCanvas) return;
    const onLost = (event: Event) => { event.preventDefault(); setContextLost(true); };
    const onRestored = () => setContextLost(false);
    rendererCanvas.addEventListener("webglcontextlost", onLost, false);
    rendererCanvas.addEventListener("webglcontextrestored", onRestored, false);
    return () => {
      rendererCanvas.removeEventListener("webglcontextlost", onLost);
      rendererCanvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [rendererCanvas]);
  useEffect(() => (el ? bindOrbit(el, () => useSettings.getState().lookSensitivity) : undefined), [el]);

  return (
    <div className="stage" ref={setEl}>
      {!capabilities.webglAvailable && <div className="bw-webgl-fallback" role="alert"><strong>Thiết bị chưa hỗ trợ WebGL.</strong><span>Hãy bật tăng tốc phần cứng hoặc dùng trình duyệt có hỗ trợ WebGL để vào thế giới 3D.</span></div>}
      <WorldAudioManager src={WORLD_AMBIENCE_URL} volume={audioVolume} />
      {WORLD_INTRO_VIDEO_URL && <WorldIntroVideo src={WORLD_INTRO_VIDEO_URL} />}
      {capabilities.webglAvailable && <Canvas key={profile.antialias ? "aa" : "noaa"} shadows={profile.shadows} dpr={profile.dpr}
        gl={{ antialias: profile.antialias, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 600, position: [0, 6, 50] }}
        onCreated={({ gl }) => { setRendererCanvas(gl.domElement); setContextLost(false); }}>
        <AdaptiveQualityMonitor quality={quality} automatic={qualityMode === "auto"} onQualityChange={setAdaptiveQuality} />
        {import.meta.env.DEV && <PerformanceProbe />}
        <LightingManager preset="day" quality={quality} />
        <RainWeatherEffect />
        <FogWeatherEffect />
        {resolveLightingQuality(quality).cinematicEffects && <CinematicPostProcessing quality={quality} />}
        <Suspense fallback={<WorldLoading />}>
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
      </Canvas>}
      {contextLost && <div className="bw-webgl-fallback" role="alert"><strong>Đồ họa đang khôi phục.</strong><span>WebGL context đã bị gián đoạn. Giữ trang mở để trình duyệt thử khôi phục renderer.</span></div>}
    </div>
  );
}
