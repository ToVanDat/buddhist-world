import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { Group, Vector3 } from "three";
import { CLIENT_SEND_HZ, type Vec3 } from "@bw/shared";
import { input } from "../core/input";
import { correction, sendState } from "../multiplayer/socket";
import { PlaceholderAvatar } from "./PlaceholderAvatar";
import { findNearbyCheckpoint, activateCheckpoint } from "../interactions/checkpoints";
import { useGame } from "../../stores/game";

const WALK = 3.2, RUN = 6, JUMP_V = 6;
const HALF = 0.45, RADIUS = 0.35;
const _cam = new Vector3(), _look = new Vector3();

/**
 * Rapier sở hữu transform nhân vật; server xác thực vị trí và có thể gửi correction.
 * Tương tác checkpoint được phát hiện theo khoảng cách và lưu qua API đã xác thực.
 */
export function PlayerController({ start, startYaw }: { start: Vec3; startYaw: number }) {
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<Group>(null);
  const { world, rapier } = useRapier();
  const facing = useRef(startYaw);
  const sendAcc = useRef(0);
  const anim = useRef<"idle" | "walk" | "run" | "jump">("idle");

  useFrame((state, dtRaw) => {
    const b = body.current; if (!b) return;
    const dt = Math.min(dtRaw, 0.05);

    if (correction.position) {
      b.setTranslation({ x: correction.position[0], y: correction.position[1], z: correction.position[2] }, true);
      correction.position = null;
    }

    const t = b.translation();
    const ray = new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
    const grounded = !!world.castRay(ray, HALF + RADIUS + 0.5, true, undefined, undefined, undefined, b);

    const nearby = findNearbyCheckpoint([t.x, t.y, t.z]);
    const game = useGame.getState();
    if (game.nearbyCheckpoint?.id !== (nearby?.id ?? null)) {
      game.setNearbyCheckpoint(nearby ? {
        id: nearby.id, name: nearby.name, description: nearby.description,
      } : null);
      game.setCheckpointMessage(null);
    }
    if (input.interactQueued) {
      input.interactQueued = false;
      if (nearby) void activateCheckpoint(nearby.id);
    }

    // Hướng di chuyển theo yaw camera.
    const ix = Math.max(-1, Math.min(1, input.keyX + input.joyX));
    const iz = Math.max(-1, Math.min(1, input.keyZ + input.joyZ));
    const s = Math.sin(input.yaw), c = Math.cos(input.yaw);
    let dx = -s * iz + c * ix, dz = -c * iz - s * ix;
    const mag = Math.hypot(dx, dz);
    const moving = mag > 0.05;
    if (moving) { dx /= Math.max(mag, 1); dz /= Math.max(mag, 1); }

    const running = (input.keySprint || input.touchSprint) && moving;
    const speed = moving ? (running ? RUN : WALK) * Math.min(mag, 1) : 0;
    const v = b.linvel();
    let vy = v.y;
    if (input.jumpQueued && grounded) vy = JUMP_V;
    input.jumpQueued = false;
    b.setLinvel({ x: dx * speed, y: vy, z: dz * speed }, true);

    if (moving) {
      const target = Math.atan2(dx, dz);
      let d = target - facing.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      facing.current += d * (1 - Math.exp(-12 * dt));
    }
    if (visual.current) visual.current.rotation.y = facing.current;
    anim.current = !grounded ? "jump" : moving ? (running ? "run" : "walk") : "idle";

    const cp = Math.cos(input.pitch);
    _cam.set(t.x + Math.sin(input.yaw) * cp * input.distance, t.y + 1.2 + Math.sin(input.pitch) * input.distance, t.z + Math.cos(input.yaw) * cp * input.distance);
    state.camera.position.lerp(_cam, 1 - Math.exp(-14 * dt));
    _look.set(t.x, t.y + 0.9, t.z);
    state.camera.lookAt(_look);

    sendAcc.current += dt;
    if (sendAcc.current >= 1 / CLIENT_SEND_HZ) {
      sendAcc.current = 0;
      sendState([t.x, t.y, t.z], facing.current, anim.current);
    }
  });

  return (
    <RigidBody ref={body} position={start} colliders={false} lockRotations enabledRotations={[false, false, false]} linearDamping={0.1} canSleep={false} ccd>
      <CapsuleCollider args={[HALF, RADIUS]} friction={0} />
      <group ref={visual} rotation-y={startYaw}>
        <PlaceholderAvatar color="#c9b27c" getMotion={() => anim.current} />
      </group>
    </RigidBody>
  );
}
