import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Group } from "three";
import { useNet } from "../../stores/net";
import { remoteTargets } from "../multiplayer/socket";
import { PlaceholderAvatar } from "./PlaceholderAvatar";

function Remote({ id }: { id: string }) {
  const ref = useRef<Group>(null);
  const inited = useRef(false);
  useFrame((_, dt) => {
    const t = remoteTargets.get(id); const g = ref.current;
    if (!t || !g) return;
    if (!inited.current) { g.position.set(t.p[0], t.p[1], t.p[2]); inited.current = true; }
    const k = 1 - Math.exp(-12 * dt);          // nội suy về snapshot mới nhất (~10 Hz)
    g.position.x += (t.p[0] - g.position.x) * k;
    g.position.y += (t.p[1] - g.position.y) * k;
    g.position.z += (t.p[2] - g.position.z) * k;
    let d = t.yaw - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * k;
  });
  const name = remoteTargets.get(id)?.name ?? "";
  return (
    <group ref={ref}>
      <PlaceholderAvatar color="#8fa68a" getMotion={() => remoteTargets.get(id)?.anim ?? "idle"} />
      <Html position={[0, 1.5, 0]} center distanceFactor={10} zIndexRange={[10, 0]}>
        <div className="nametag">{name}</div>
      </Html>
    </group>
  );
}

export function RemotePlayers() {
  const ids = useNet((s) => s.remoteIds);
  return <>{ids.map((id) => <Remote key={id} id={id} />)}</>;
}
