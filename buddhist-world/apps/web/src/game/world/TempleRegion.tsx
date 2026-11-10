import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { LotusPondWater, MountainRetreatWaterfall } from "./WaterSurface";

/**
 * PLACEHOLDER BLOCKOUT của region "temple_complex" (hình khối thô để kiểm tra tỷ lệ, va chạm, camera).
 * KHÔNG phải kiến trúc cuối cùng. Sẽ được thay bằng GLB từ Blender (Phase 2/4).
 * Đơn vị: mét. Cổng Tam Quan ở z = 20, sân chùa ở z = 0, chính điện ở z = -22.
 */
const stone = "#8d8577", wood = "#5a3f2b", roof = "#6b4a3a";

function Column({ x, z, h = 5 }: { x: number; z: number; h?: number }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[x, h / 2, z]}>
      <CuboidCollider args={[0.35, h / 2, 0.35]} />
      <mesh castShadow receiveShadow><boxGeometry args={[0.7, h, 0.7]} /><meshStandardMaterial color={wood} roughness={0.8} /></mesh>
    </RigidBody>
  );
}

function Gate() {
  return (
    <group position={[0, 0, 20]}>
      {[-4.5, -1.5, 1.5, 4.5].map((x) => <Column key={x} x={x} z={0} h={x === -1.5 || x === 1.5 ? 6.5 : 5} />)}
      <mesh castShadow position={[0, 7, 0]}><boxGeometry args={[11, 0.5, 1.6]} /><meshStandardMaterial color={roof} roughness={0.7} /></mesh>
      <mesh castShadow position={[0, 7.8, 0]}><boxGeometry args={[9, 1, 1.2]} /><meshStandardMaterial color={roof} roughness={0.7} /></mesh>
    </group>
  );
}

function MainHall() {
  return (
    <group position={[0, 0, -22]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[10, 0.4, 7]} position={[0, 0.4, 0]} />
        <CuboidCollider args={[8, 3, 0.4]} position={[0, 3.2, -5]} />
      </RigidBody>
      <mesh receiveShadow castShadow position={[0, 0.4, 0]}><boxGeometry args={[20, 0.8, 14]} /><meshStandardMaterial color={stone} roughness={0.95} /></mesh>
      <mesh castShadow position={[0, 3.2, -5]}><boxGeometry args={[16, 6, 0.8]} /><meshStandardMaterial color="#b9a888" roughness={0.9} /></mesh>
      <mesh castShadow position={[0, 7.5, -1]}><boxGeometry args={[22, 1.2, 14]} /><meshStandardMaterial color={roof} roughness={0.65} /></mesh>
      {[-8, -4, 0, 4, 8].map((x) => <Column key={x} x={x} z={5} h={6.5} />)}
    </group>
  );
}

export function TempleRegion() {
  return (
    <group>
      {/* Mặt đất */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[125, 0.5, 125]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh receiveShadow rotation-x={-Math.PI / 2}><planeGeometry args={[250, 250]} /><meshStandardMaterial color="#5f6b4c" roughness={1} /></mesh>
      {/* Con đường đá */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}><planeGeometry args={[5, 60]} /><meshStandardMaterial color={stone} roughness={0.95} /></mesh>
      {/* Ao sen: shader nước runtime; đặt dưới lá sen và cụm hoa. */}
      <LotusPondWater position={[-18, 0.025, 4]} rotation={[-Math.PI / 2, 0, 0]} size={[14, 14]} deepColor="#123d43" shallowColor="#579b91" />
      <Gate />
      <MainHall />
      {/* Waterfall/mist/impact pool are blockout set dressing; replace with authored GLB later. */}
      <MountainRetreatWaterfall />
    </group>
  );
}
