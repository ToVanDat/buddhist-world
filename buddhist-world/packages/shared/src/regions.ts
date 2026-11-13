import type { Vec3 } from "./types.js";

export interface SpawnPoint { id: string; name: string; description: string; position: Vec3; yaw: number }
export interface RegionAssetDef {
  id: string;
  src: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  /** Static trimesh collision is enabled by default for environment geometry. */
  collision?: boolean;
  /** Render the GLB. Set false for collision-only meshes that should remain invisible. */
  render?: boolean;
  /** Alternative visual representations, ordered from nearest to farthest. */
  lods?: [RegionAssetLodDef, RegionAssetLodDef, RegionAssetLodDef];
  /** Hide the asset beyond this camera distance (metres). */
  cullDistance?: number;
  /** Optional GPU-instanced placement transforms for static vegetation batches. */
  instances?: RegionAssetInstanceDef[];
}
export interface RegionAssetInstanceDef {
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}
export interface RegionAssetLodDef {
  src: string;
  /** Camera distance in metres at which this representation becomes active. */
  distance: number;
  /** Three.js LOD hysteresis fraction to reduce rapid switching at thresholds. */
  hysteresis?: number;
}

export interface RegionDef {
  id: string;
  name: string;
  /** Hộp giới hạn AABB trong tọa độ thế giới (Y-up, mét). */
  bounds: { min: Vec3; max: Vec3 };
  spawns: SpawnPoint[];
  defaultSpawn: string;
  /** Asset GLB cần tải (đường dẫn dưới /assets). Rỗng = dùng placeholder. */
  assets: RegionAssetDef[];
  /** Region navigation mesh JSON, served under the web public assets root. */
  navmesh?: string;
  /** Keep the temporary blockout while real assets are integrated incrementally. */
  blockout?: boolean;
}

/** Manifest region. Thêm region mới = thêm một phần tử, không sửa hệ thống khác. */
export const REGIONS: Record<string, RegionDef> = {
  temple_complex: {
    id: "temple_complex",
    name: "Khuôn viên chùa",
    bounds: { min: [-120, -5, -120], max: [120, 60, 120] },
    spawns: [
      // Coordinates are aligned with the current TempleRegion blockout:
      // Tam Quan z=20, courtyard z=0, main hall z=-22, pond center x=-18.
      { id: "main_entrance", name: "Tam Quan", description: "Cổng tam quan – lối vào khuôn viên", position: [0, 1.2, 20], yaw: Math.PI },
      { id: "courtyard", name: "Sân chùa", description: "Khoảng sân yên tĩnh giữa khuôn viên", position: [0, 1.2, 0], yaw: Math.PI },
      { id: "main_hall", name: "Chính điện", description: "Không gian chiêm bái tại chính điện", position: [0, 1.2, -22], yaw: Math.PI },
      { id: "lotus_pond", name: "Hồ sen", description: "Lối dạo cạnh hồ sen", position: [-18, 1.2, 4], yaw: Math.PI / 2 },
    ],
    defaultSpawn: "main_entrance",
    assets: [],
    navmesh: "/assets/navmesh/temple_complex.json",
    blockout: true,
  },
};

export const DEFAULT_REGION_ID = "temple_complex";
export const getRegion = (id: string): RegionDef | undefined => REGIONS[id];


export interface RegionManifestIssue {
  regionId: string;
  path: string;
  message: string;
}

const isFiniteVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && Number.isFinite(part));

/**
 * Validate region metadata without requiring any Blender/GLB files.
 * This is deliberately a data-contract check, not an asset/runtime validator.
 */
export function validateRegionManifest(regions: Record<string, RegionDef>): RegionManifestIssue[] {
  const issues: RegionManifestIssue[] = [];
  const add = (regionId: string, path: string, message: string) => issues.push({ regionId, path, message });

  for (const [key, region] of Object.entries(regions)) {
    const id = region.id;
    if (key !== id) add(id, "id", `registry key "${key}" does not match region.id`);

    const min = region.bounds?.min;
    const max = region.bounds?.max;
    if (!isFiniteVec3(min) || !isFiniteVec3(max)) {
      add(id, "bounds", "bounds min/max must be finite 3D vectors");
    } else {
      for (let axis = 0; axis < 3; axis += 1) {
        if (min[axis]! >= max[axis]!) add(id, `bounds[${axis}]`, "minimum must be lower than maximum");
      }
    }

    if (!region.spawns.length) add(id, "spawns", "region must define at least one spawn point");
    const spawnIds = new Set<string>();
    for (const [index, spawn] of region.spawns.entries()) {
      if (!spawn.id.trim()) add(id, `spawns[${index}].id`, "spawn id cannot be empty");
      if (spawnIds.has(spawn.id)) add(id, `spawns[${index}].id`, `duplicate spawn id "${spawn.id}"`);
      spawnIds.add(spawn.id);
      if (!isFiniteVec3(spawn.position)) {
        add(id, `spawns[${index}].position`, "spawn position must be a finite 3D vector");
      } else if (isFiniteVec3(min) && isFiniteVec3(max)) {
        const outside = spawn.position.some((value, axis) => value < min[axis]! || value > max[axis]!);
        if (outside) add(id, `spawns[${index}].position`, "spawn position is outside region bounds");
      }
      if (!Number.isFinite(spawn.yaw)) add(id, `spawns[${index}].yaw`, "spawn yaw must be finite");
    }
    if (!spawnIds.has(region.defaultSpawn)) {
      add(id, "defaultSpawn", `default spawn "${region.defaultSpawn}" does not exist in spawns`);
    }

    const assetIds = new Set<string>();
    for (const [index, asset] of region.assets.entries()) {
      const path = `assets[${index}]`;
      if (!asset.id.trim()) add(id, `${path}.id`, "asset id cannot be empty");
      if (assetIds.has(asset.id)) add(id, `${path}.id`, `duplicate asset id "${asset.id}"`);
      assetIds.add(asset.id);
      if (!asset.src.startsWith("/assets/") || !asset.src.toLowerCase().endsWith(".glb")) {
        add(id, `${path}.src`, "asset src must be an absolute /assets/*.glb path");
      }
      for (const [name, vector] of [["position", asset.position], ["rotation", asset.rotation], ["scale", asset.scale]] as const) {
        if (vector !== undefined && !isFiniteVec3(vector)) add(id, `${path}.${name}`, "transform must be a finite 3D vector");
      }
      if (asset.lods) {
        let previousDistance = -1;
        for (const [lodIndex, lod] of asset.lods.entries()) {
          if (!lod.src.startsWith("/assets/") || !lod.src.toLowerCase().endsWith(".glb")) {
            add(id, `${path}.lods[${lodIndex}].src`, "LOD src must be an absolute /assets/*.glb path");
          }
          if (!Number.isFinite(lod.distance) || lod.distance <= previousDistance) {
            add(id, `${path}.lods[${lodIndex}].distance`, "LOD distances must be finite, positive and strictly increasing");
          }
          previousDistance = lod.distance;
        }
      }
      for (const [instanceIndex, instance] of (asset.instances ?? []).entries()) {
        if (!isFiniteVec3(instance.position)) add(id, `${path}.instances[${instanceIndex}].position`, "instance position must be a finite 3D vector");
        if (instance.rotation !== undefined && !isFiniteVec3(instance.rotation)) add(id, `${path}.instances[${instanceIndex}].rotation`, "instance rotation must be a finite 3D vector");
        if (instance.scale !== undefined && !isFiniteVec3(instance.scale)) add(id, `${path}.instances[${instanceIndex}].scale`, "instance scale must be a finite 3D vector");
      }
    }

    if (region.navmesh && !region.navmesh.startsWith("/assets/navmesh/")) {
      add(id, "navmesh", "navmesh path must be under /assets/navmesh/");
    }
  }

  return issues;
}
