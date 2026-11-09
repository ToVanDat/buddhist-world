import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { Group, Vector3 } from "three";
import { CLIENT_SEND_HZ, type Vec3 } from "@bw/shared";
import { input } from "../core/input";
import { correction, sendState } from "../multiplayer/socket";
import { PlaceholderAvatar } from "./PlaceholderAvatar";
import { GLBAvatar } from "./GLBAvatar";

const PLAYER_MODEL_URL = import.meta.env.VITE_PLAYER_MODEL_URL?.trim() ?? "";
import { findNearbyCheckpoint, activateCheckpoint } from "../interactions/checkpoints";
import { useGame } from "../../stores/game";

const WALK = 3.2, RUN = 6, JUMP_V = 6;
const HALF = 0.45, RADIUS = 0.35;
const _cam = new Vector3(), _look = new Vector3(), _cameraDirection = new Vector3();

export function PlayerController({ start, startYaw }: { start: Vec3; startYaw: number }) {
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<Group>(null);
  const { world, rapier } = useRapier();
  const facing = useRef(startYaw);
  const sendAcc = useRef(0);
  const anim = useRef<"idle" | "walk" | "run" | "jump">("idle");

  // A new region spawn remounts this controller; align orbit camera and avatar yaw.
  useEffect(() => {
    facing.current = startYaw;
    input.yaw = startYaw;
    if (visual.current) visual.current.rotation.y = startYaw;
  }, [startYaw]);

  useFrame((state, dtRaw) => {
    const b = body.current; if (!b) return;
    const dt = Math.min(dtRaw, 0.05);
    if (correction.position) {
      b.setTranslation({ x: correction.position[0], y: correction.position[1], z: correction.position[2] }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      correction.position = null;
    }
    const t = b.translation();
    const ray = new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
    const grounded = !!world.castRay(ray, HALF + RADIUS + 0.5, true, undefined, undefined, undefined, b);
    const nearby = findNearbyCheckpoint([t.x, t.y, t.z]);
    const game = useGame.getState();
    if (game.nearbyCheckpoint?.id !== (nearby?.id ?? null)) {
      game.setNearbyCheckpoint(nearby ? { id: nearby.id, name: nearby.name, description: nearby.description } : null);
      game.setCheckpointMessage(null);
    }
    if (input.interactQueued) {
      input.interactQueued = false;
      if (nearby) void activateCheckpoint(nearby.id);
    }

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
    _look.set(t.x, t.y + 0.9, t.z);
    _cam.set(
      t.x + Math.sin(input.yaw) * cp * input.distance,
      t.y + 1.2 + Math.sin(input.pitch) * input.distance,
      t.z + Math.cos(input.yaw) * cp * input.distance,
    );
    const desiredDistance = _cameraDirection.copy(_cam).sub(_look).length();
    if (desiredDistance > 0) {
      _cameraDirection.normalize();
      const cameraRay = new rapier.Ray(
        { x: _look.x, y: _look.y, z: _look.z },
        { x: _cameraDirection.x, y: _cameraDirection.y, z: _cameraDirection.z },
      );
      const obstruction = world.castRay(cameraRay, desiredDistance, true, undefined, undefined, undefined, b);
      const safeDistance = obstruction ? Math.max(0.15, obstruction.timeOfImpact - 0.25) : desiredDistance;
      _cam.copy(_look).addScaledVector(_cameraDirection, safeDistance);
      if (obstruction) state.camera.position.copy(_cam);
      else state.camera.position.lerp(_cam, 1 - Math.exp(-14 * dt));
    }
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
        {PLAYER_MODEL_URL ? <GLBAvatar src={PLAYER_MODEL_URL} getMotion={() => anim.current} /> : <PlaceholderAvatar color="#c9b27c" getMotion={() => anim.current} />}
      </group>
    </RigidBody>
  );
}
