import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Group } from "three";
import { useNet } from "../../stores/net";
import { remoteTargets } from "../multiplayer/socket";
import { PlaceholderAvatar } from "./PlaceholderAvatar";
import { GLBAvatarWithFallback } from "./GLBAvatar";

const PLAYER_MODEL_URL = import.meta.env.VITE_PLAYER_MODEL_URL?.trim() ?? "";

function Remote({ id }: { id: string }) {
  const ref = useRef<Group>(null);
  const inited = useRef(false);
  useFrame((_, dt) => {
    const t = remoteTargets.get(id); const g = ref.current;
    if (!t || !g) return;
    // A suspended/background tab can deliver a very large frame delta on resume.
    // Bound interpolation so remote avatars never snap through the scene.
    const safeDt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.05) : 0;
    if (!t.p.every(Number.isFinite) || !Number.isFinite(t.yaw)) return;
    if (!inited.current) { g.position.set(t.p[0], t.p[1], t.p[2]); inited.current = true; }
    const k = 1 - Math.exp(-12 * safeDt);      // nội suy ổn định giữa các snapshot (~10 Hz)
    g.position.x += (t.p[0] - g.position.x) * k;
    g.position.y += (t.p[1] - g.position.y) * k;
    g.position.z += (t.p[2] - g.position.z) * k;
    let d = t.yaw - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * k;
  });
  const name = remoteTargets.get(id)?.name ?? "";
  return (
    <group ref={ref}>
      {PLAYER_MODEL_URL ? (
        <GLBAvatarWithFallback src={PLAYER_MODEL_URL} getMotion={() => remoteTargets.get(id)?.anim ?? "idle"}
          fallback={<PlaceholderAvatar color="#8fa68a" getMotion={() => remoteTargets.get(id)?.anim ?? "idle"} />} />
      ) : <PlaceholderAvatar color="#8fa68a" getMotion={() => remoteTargets.get(id)?.anim ?? "idle"} />}
      <Html position={[0, 1.5, 0]} center distanceFactor={10} zIndexRange={[10, 0]} occlude>
        <div className="nametag">{name}</div>
      </Html>
    </group>
  );
}

export function RemotePlayers() {
  const ids = useNet((s) => s.remoteIds);
  return <>{ids.map((id) => <Remote key={id} id={id} />)}</>;
}
