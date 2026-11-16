import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { LightingManager } from "../game/lighting/LightingManager";
import { TempleRegion } from "../game/world/TempleRegion";

/**
 * A lightweight, non-interactive title-screen view of the existing procedural
 * temple blockout. It deliberately does not connect sockets or create a player.
 */
export function LoginBackdrop() {
  return (
    <div className="login-world" aria-hidden="true">
      <Canvas
        dpr={[1, 1.35]}
        shadows
        camera={{ fov: 43, near: 0.1, far: 420, position: [13, 8, 49] }}
        gl={{ antialias: true, powerPreference: "low-power", alpha: false }}
      >
        <LightingManager preset="sunset" quality="MEDIUM" shadowsEnabled={true} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} timeStep="vary">
            <group position={[0, -0.15, 0]}>
              <TempleRegion />
            </group>
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  );
}
