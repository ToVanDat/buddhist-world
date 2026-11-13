import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { LightingManager } from "./game/lighting/LightingManager";
import { TempleArchitecturalLights } from "./game/world/TempleArchitecturalLights";
import { TempleRegion } from "./game/world/TempleRegion";
import { RainWeatherEffect } from "./game/rendering/RainWeatherEffect";
import { FogWeatherEffect } from "./game/rendering/FogWeatherEffect";
import { PROFILES, type Quality } from "./game/rendering/quality";
import type { LightingPreset } from "./game/lighting/LightingProfiles";
import type { WorldEnvironmentSnapshot } from "@bw/shared";
import { useSettings } from "./stores/settings";
import { useWorldEnvironment } from "./stores/worldEnvironment";

const presets: LightingPreset[] = ["dawn", "day", "sunset", "night"];
const qualities: Quality[] = ["ULTRA", "HIGH", "MEDIUM", "LOW", "MOBILE"];
const weathers: WorldEnvironmentSnapshot["weather"][] = ["clear", "cloudy", "rain", "fog"];
const params = new URLSearchParams(window.location.search);
const preset = presets.includes(params.get("preset") as LightingPreset) ? params.get("preset") as LightingPreset : "day";
const quality = qualities.includes(params.get("quality") as Quality) ? params.get("quality") as Quality : "HIGH";
const weather = weathers.includes(params.get("weather") as WorldEnvironmentSnapshot["weather"]) ? params.get("weather") as WorldEnvironmentSnapshot["weather"] : "clear";
const weatherIntensity = weather === "clear" ? 0 : 0.8;

useSettings.setState({ quality });
useWorldEnvironment.setState({
  snapshot: {
    serverTimeMs: Date.now(),
    worldMinute: 720,
    worldSecond: 0,
    preset,
    fromPreset: preset,
    toPreset: preset,
    transition: 0,
    weather,
    weatherIntensity,
  },
  receivedAt: Date.now(),
});

function MarkFirstFrame() {
  const elapsed = { current: 0 };
  useFrame(({ gl }, delta) => {
    document.documentElement.dataset.visualQaReady = "true";
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    document.documentElement.dataset.renderCalls = String(gl.info.render.calls);
    document.documentElement.dataset.renderTriangles = String(gl.info.render.triangles);
    document.documentElement.dataset.memoryGeometries = String(gl.info.memory.geometries);
    document.documentElement.dataset.memoryTextures = String(gl.info.memory.textures);
    document.documentElement.dataset.renderPrograms = String(gl.info.programs?.length ?? 0);
    elapsed.current = 0;
  });
  return null;
}

function VisualQaScene() {
  const profile = PROFILES[quality];
  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#101820" }}>
      <Canvas
        shadows={profile.shadows}
        dpr={profile.dpr}
        gl={{ antialias: profile.antialias, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 600, position: [0, 14, 56] }}
        onCreated={({ gl }) => {
          gl.setClearColor("#101820");
          document.documentElement.dataset.webglCreated = "true";
        }}
      >
        <LightingManager preset={preset} quality={quality} />
        <RainWeatherEffect />
        <FogWeatherEffect />
        <Physics gravity={[0, -20, 0]} timeStep="vary">
          <TempleRegion />
        </Physics>
        <TempleArchitecturalLights />
        <MarkFirstFrame />
      </Canvas>
      <aside
        aria-label="Lighting visual QA settings"
        style={{
          position: "absolute", top: 16, left: 16, zIndex: 2, padding: "10px 14px",
          border: "1px solid rgba(255,255,255,.2)", borderRadius: 12,
          color: "#f5eee2", background: "rgba(12,18,24,.72)",
          font: "12px/1.6 ui-monospace, SFMono-Regular, monospace",
          pointerEvents: "none",
        }}
      >
        <strong style={{ display: "block", fontSize: 14 }}>BUDDHIST WORLD · LIGHTING QA</strong>
        <span data-testid="qa-preset">Preset: {preset}</span><br />
        <span data-testid="qa-quality">Quality: {quality}</span><br />
        <span data-testid="qa-weather">Weather: {weather} ({weatherIntensity.toFixed(1)})</span>
      </aside>
    </main>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.dataset.visualQaPreset = preset;
    document.documentElement.dataset.visualQaQuality = quality;
  }, []);
  return <VisualQaScene />;
}

createRoot(document.getElementById("visual-qa-root")!).render(<StrictMode><App /></StrictMode>);
