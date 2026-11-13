import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useSettings } from "../../stores/settings";
import { resolveRoofTileSpacing } from "./roofTileQuality";

export interface TempleRoofTileLayoutOptions {
  width: number;
  depth: number;
  rise: number;
  tileWidth: number;
  tileDepth: number;
  cornerLift?: number;
  eaveDrop?: number;
}

export interface TempleRoofTileTransform {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationZ: number;
  variation: number;
}

function roofHeight(x: number, z: number, options: TempleRoofTileLayoutOptions): number {
  const nx = Math.abs((2 * x) / options.width);
  const nz = Math.abs((2 * z) / options.depth);
  const cornerLift = options.cornerLift ?? 0.82;
  const eaveDrop = options.eaveDrop ?? 0.2;
  return options.rise * (1 - nx * nx)
    + cornerLift * Math.pow(nx, 6)
    + cornerLift * 0.24 * Math.pow(nz, 6)
    - eaveDrop * Math.pow(Math.max(nx, nz), 3);
}

/** Deterministic tile placement follows the exact procedural roof surface. */
export function createTempleRoofTileLayout(options: TempleRoofTileLayoutOptions): TempleRoofTileTransform[] {
  const width = Math.max(0.1, Number.isFinite(options.width) ? options.width : 0.1);
  const depth = Math.max(0.1, Number.isFinite(options.depth) ? options.depth : 0.1);
  const tileWidth = Math.max(0.2, Number.isFinite(options.tileWidth) ? options.tileWidth : 0.2);
  const tileDepth = Math.max(0.2, Number.isFinite(options.tileDepth) ? options.tileDepth : 0.2);
  const safe = { ...options, width, depth };
  const transforms: TempleRoofTileTransform[] = [];
  const epsilon = 0.025;
  const columns = Math.max(1, Math.floor((width - tileWidth * 0.45) / tileWidth) + 1);
  const rows = Math.max(1, Math.floor((depth - tileDepth * 0.45) / tileDepth) + 1);

  for (let row = 0; row < rows; row += 1) {
    const z = -depth / 2 + tileDepth * 0.5 + row * tileDepth;
    const stagger = row % 2 === 0 ? 0 : tileWidth * 0.5;
    for (let column = 0; column < columns; column += 1) {
      const x = -width / 2 + tileWidth * 0.5 + column * tileWidth + stagger;
      if (Math.abs(x) > width / 2 - tileWidth * 0.28 || Math.abs(z) > depth / 2 - tileDepth * 0.28) continue;
      const dx = (roofHeight(x + epsilon, z, safe) - roofHeight(x - epsilon, z, safe)) / (epsilon * 2);
      const dz = (roofHeight(x, z + epsilon, safe) - roofHeight(x, z - epsilon, safe)) / (epsilon * 2);
      const variation = ((row * 37 + column * 17) % 11) / 10;
      transforms.push({
        x,
        y: roofHeight(x, z, safe) + 0.07,
        z,
        rotationX: -Math.atan(dz),
        rotationZ: Math.atan(dx),
        variation,
      });
    }
  }
  return transforms;
}

/** Small rounded ceramic tile with a softly crowned face and beveled perimeter. */
export function createTempleRoofTileGeometry(width: number, depth: number, thickness = 0.075): THREE.BufferGeometry {
  const w = Math.max(0.2, Number.isFinite(width) ? width : 0.2);
  const d = Math.max(0.2, Number.isFinite(depth) ? depth : 0.2);
  const t = Math.max(0.025, Number.isFinite(thickness) ? thickness : 0.075);
  const radius = Math.min(w, d) * 0.11;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + radius, -d / 2);
  shape.lineTo(w / 2 - radius, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + radius);
  shape.lineTo(w / 2, d / 2 - radius);
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - radius, d / 2);
  shape.lineTo(-w / 2 + radius, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - radius);
  shape.lineTo(-w / 2, -d / 2 + radius);
  shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + radius, -d / 2);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: t,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: Math.min(0.018, t * 0.22),
    bevelThickness: Math.min(0.018, t * 0.22),
    curveSegments: 3,
  });
  geometry.translate(0, 0, -t / 2);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const crown = Math.max(0, 1 - Math.pow((2 * x) / w, 2)) * 0.018;
    positions.setY(index, positions.getY(index) + crown);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function TempleRoofTileField({
  width, depth, rise, texture,
}: {
  width: number;
  depth: number;
  rise: number;
  texture: THREE.Texture;
}) {
  const quality = useSettings((state) => state.quality);
  const [tileWidth, tileDepth] = resolveRoofTileSpacing(quality);
  const batch = useMemo(() => {
    const layout = createTempleRoofTileLayout({
      width, depth, rise, tileWidth, tileDepth, cornerLift: 0.82, eaveDrop: 0.2,
    });
    const geometry = createTempleRoofTileGeometry(tileWidth * 0.94, tileDepth * 0.91);
    const material = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: texture,
      roughness: 0.78,
      metalness: 0.025,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, layout.length);
    const dummy = new THREE.Object3D();
    const palette = ["#744b3e", "#805447", "#684338", "#895b4a", "#71483c"];
    layout.forEach((tile, index) => {
      dummy.position.set(tile.x, tile.y, tile.z);
      dummy.rotation.set(tile.rotationX, 0, tile.rotationZ);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const colorIndex = Math.floor(tile.variation * palette.length) % palette.length;
      mesh.setColorAt(index, new THREE.Color(palette[colorIndex]!));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return { mesh, geometry, material };
  }, [width, depth, rise, tileWidth, tileDepth, texture]);

  useEffect(() => () => {
    batch.geometry.dispose();
    batch.material.dispose();
  }, [batch]);

  return <primitive object={batch.mesh} />;
}
