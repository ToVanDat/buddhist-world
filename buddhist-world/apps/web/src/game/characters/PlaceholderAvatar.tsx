/**
 * PLACEHOLDER – không phải asset cuối cùng.
 * Sẽ được thay bằng GLB nhân vật có rig/animation (Phase 3) – xem docs/STATUS.md.
 */
export function PlaceholderAvatar({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.35, 0.9, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* "mũi" cho biết hướng nhìn (+Z) */}
      <mesh castShadow position={[0, 0.35, 0.34]}>
        <boxGeometry args={[0.12, 0.12, 0.16]} />
        <meshStandardMaterial color="#3a342b" roughness={0.9} />
      </mesh>
    </group>
  );
}
