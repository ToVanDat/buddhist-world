import type { Vec3 } from "./types.js";
import { TEMPLE_LAYOUT, validateTempleSpawnSafety } from "./templeLayout.js";

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
  /** Optional authored world-space AABB occupied by this asset; used for overlap and spawn-clearance validation. */
  occupiedBounds?: { min: Vec3; max: Vec3 };
  /** Optional streaming chunk that owns this asset. Unassigned assets remain region-resident. */
  chunkId?: string;
}
export interface RegionAssetInstanceDef {
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  /** Optional authored world-space AABB occupied by this instance. */
  occupiedBounds?: { min: Vec3; max: Vec3 };
}
export interface RegionAssetLodDef {
  src: string;
  /** Camera distance in metres at which this representation becomes active. */
  distance: number;
  /** Three.js LOD hysteresis fraction to reduce rapid switching at thresholds. */
  hysteresis?: number;
}

export interface RegionChunkDef {
  id: string;
  bounds: { min: Vec3; max: Vec3 };
  loadRadius: number;
  unloadRadius: number;
  priority?: number;
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
  /** Optional independently streamed groups. Existing regions without chunks retain legacy behavior. */
  chunks?: RegionChunkDef[];
}

/** Manifest region. Thêm region mới = thêm một phần tử, không sửa hệ thống khác. */
export const REGIONS: Record<string, RegionDef> = {
  temple_complex: {
    id: "temple_complex",
    name: "Khuôn viên chùa",
    bounds: TEMPLE_LAYOUT.bounds,
    spawns: [
      { id: "main_entrance", name: "Tam Quan", description: "Cổng Tam Quan là ngưỡng bước vào không gian chùa. Hãy dừng lại quan sát bố cục cổng, mái và các chi tiết trang trí; ý nghĩa cụ thể của từng lối đi có thể khác nhau giữa các ngôi chùa.", ...TEMPLE_LAYOUT.spawns.mainEntrance },
      { id: "courtyard", name: "Sân chùa", description: "Sân chùa kết nối các công trình và tạo khoảng không cho sinh hoạt chung. Bạn có thể thong thả quan sát trục kiến trúc, hàng cây và khoảng sân trước khi tiến vào chính điện.", ...TEMPLE_LAYOUT.spawns.courtyard },
      { id: "main_hall", name: "Chính điện", description: "Chính điện thường là không gian thờ tự quan trọng của ngôi chùa. Khi tham quan, hãy giữ giọng nói nhỏ, tôn trọng người đang hành lễ và quan sát cách bố trí tôn tượng cùng bàn thờ.", ...TEMPLE_LAYOUT.spawns.mainHall },
      { id: "lotus_pond", name: "Hồ sen", description: "Hồ sen tạo nên một khoảng lắng giữa cảnh quan. Trong nhiều truyền thống Phật giáo, hoa sen gợi nhắc sự thanh khiết và khả năng vươn lên giữa bùn; hãy dành một chút thời gian quan sát mặt nước và nhịp chuyển động của lá.", ...TEMPLE_LAYOUT.spawns.lotusPond },
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
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isValidManifestVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 &&
  value.every((part) => typeof part === "number" && Number.isFinite(part));
const isValidAabb = (value: unknown): value is { min: Vec3; max: Vec3 } => {
  if (!isRecord(value) || !isValidManifestVec3(value.min) || !isValidManifestVec3(value.max)) return false;
  return value.min.every((part, axis) => part < value.max[axis]!);
};
const aabbsOverlap = (a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }) =>
  a.min.every((value, axis) => value < b.max[axis]!) &&
  a.max.every((value, axis) => value > b.min[axis]!);
const aabbInside = (inner: { min: Vec3; max: Vec3 }, outerMin: Vec3, outerMax: Vec3) =>
  inner.min.every((value, axis) => value >= outerMin[axis]!) &&
  inner.max.every((value, axis) => value <= outerMax[axis]!);

/** Validate untrusted region data without dereferencing malformed nested values. */
export function validateRegionManifest(input: unknown): RegionManifestIssue[] {
  const issues: RegionManifestIssue[] = [];
  const add = (regionId: string, path: string, message: string) =>
    issues.push({ regionId, path, message });
  if (!isRecord(input)) {
    add("<manifest>", "regions", "region manifest must be an object keyed by region id");
    return issues;
  }

  const regionIds = new Set<string>();
  for (const [key, rawRegion] of Object.entries(input)) {
    if (!isRecord(rawRegion)) {
      add(key, "region", "region entry must be an object");
      continue;
    }
    const id = typeof rawRegion.id === "string" && rawRegion.id.trim() ? rawRegion.id : key;
    if (typeof rawRegion.id !== "string" || !rawRegion.id.trim()) add(id, "id", "region id must be a non-empty string");
    if (key !== id) add(id, "id", "registry key \"" + key + "\" does not match region.id");
    if (regionIds.has(id)) add(id, "id", "duplicate region id \"" + id + "\"");
    regionIds.add(id);

    const bounds = isRecord(rawRegion.bounds) ? rawRegion.bounds : null;
    const regionMin = bounds && isValidManifestVec3(bounds.min) ? bounds.min : null;
    const regionMax = bounds && isValidManifestVec3(bounds.max) ? bounds.max : null;
    let boundsValid = false;
    if (regionMin === null || regionMax === null) {
      add(id, "bounds", "bounds min/max must be finite 3D vectors");
    } else {
      boundsValid = true;
      for (let axis = 0; axis < 3; axis += 1) {
        if (regionMin[axis]! >= regionMax[axis]!) {
          add(id, "bounds[" + axis + "]", "minimum must be lower than maximum");
          boundsValid = false;
        }
      }
    }

    const spawnIds = new Set<string>();
    const safeSpawns: SpawnPoint[] = [];
    if (!Array.isArray(rawRegion.spawns)) {
      add(id, "spawns", "spawns must be an array");
    } else {
      if (rawRegion.spawns.length === 0) add(id, "spawns", "region must define at least one spawn point");
      for (const [index, rawSpawn] of rawRegion.spawns.entries()) {
        const path = "spawns[" + index + "]";
        if (!isRecord(rawSpawn)) {
          add(id, path, "spawn must be an object");
          continue;
        }
        const spawnId = typeof rawSpawn.id === "string" ? rawSpawn.id : "";
        if (!spawnId.trim()) add(id, path + ".id", "spawn id cannot be empty");
        if (spawnIds.has(spawnId)) add(id, path + ".id", "duplicate spawn id \"" + spawnId + "\"");
        if (spawnId) spawnIds.add(spawnId);
        if (typeof rawSpawn.name !== "string") add(id, path + ".name", "spawn name must be a string");
        if (typeof rawSpawn.description !== "string") add(id, path + ".description", "spawn description must be a string");
        const position = isValidManifestVec3(rawSpawn.position) ? rawSpawn.position : null;
        if (!position) {
          add(id, path + ".position", "spawn position must be a finite 3D vector");
        } else if (boundsValid && regionMin && regionMax) {
          const outside = position.some((value, axis) => value < regionMin[axis]! || value > regionMax[axis]!);
          if (outside) add(id, path + ".position", "spawn position is outside region bounds");
        }
        const yaw = typeof rawSpawn.yaw === "number" && Number.isFinite(rawSpawn.yaw) ? rawSpawn.yaw : null;
        if (yaw === null) add(id, path + ".yaw", "spawn yaw must be finite");
        if (spawnId && typeof rawSpawn.name === "string" &&
            typeof rawSpawn.description === "string" && position && yaw !== null) {
          safeSpawns.push({ id: spawnId, name: rawSpawn.name, description: rawSpawn.description, position, yaw });
        }
      }
    }
    if (safeSpawns.length) {
      try {
        for (const message of validateTempleSpawnSafety(safeSpawns, id)) add(id, "spawns", message);
      } catch {
        add(id, "spawns", "spawn safety validation could not process malformed spawn data");
      }
    }
    if (typeof rawRegion.defaultSpawn !== "string" || !spawnIds.has(rawRegion.defaultSpawn)) {
      add(id, "defaultSpawn", "default spawn must reference an existing spawn id");
    }

    const chunkIds = new Set<string>();
    const chunks = rawRegion.chunks === undefined ? [] : rawRegion.chunks;
    if (!Array.isArray(chunks)) {
      add(id, "chunks", "chunks must be an array when provided");
    } else {
      for (const [index, rawChunk] of chunks.entries()) {
        const path = "chunks[" + index + "]";
        if (!isRecord(rawChunk)) {
          add(id, path, "chunk must be an object");
          continue;
        }
        const chunkId = typeof rawChunk.id === "string" ? rawChunk.id : "";
        if (!chunkId.trim()) add(id, path + ".id", "chunk id cannot be empty");
        if (chunkIds.has(chunkId)) add(id, path + ".id", "duplicate chunk id \"" + chunkId + "\"");
        if (chunkId) chunkIds.add(chunkId);
        const chunkBounds = isRecord(rawChunk.bounds) ? rawChunk.bounds : null;
        const chunkMin = chunkBounds && isValidManifestVec3(chunkBounds.min) ? chunkBounds.min : null;
        const chunkMax = chunkBounds && isValidManifestVec3(chunkBounds.max) ? chunkBounds.max : null;
        if (!chunkMin || !chunkMax) {
          add(id, path + ".bounds", "chunk bounds must contain finite 3D min/max vectors");
        } else {
          for (let axis = 0; axis < 3; axis += 1) {
            if (chunkMin[axis]! >= chunkMax[axis]!) add(id, path + ".bounds[" + axis + "]", "chunk minimum must be lower than maximum");
            if (boundsValid && regionMin && regionMax &&
                (chunkMin[axis]! < regionMin[axis]! || chunkMax[axis]! > regionMax[axis]!)) {
              add(id, path + ".bounds[" + axis + "]", "chunk bounds must be contained by region bounds");
            }
          }
        }
        if (typeof rawChunk.loadRadius !== "number" || !Number.isFinite(rawChunk.loadRadius) || rawChunk.loadRadius <= 0) {
          add(id, path + ".loadRadius", "chunk load radius must be finite and positive");
        }
        if (typeof rawChunk.unloadRadius !== "number" || !Number.isFinite(rawChunk.unloadRadius) ||
            typeof rawChunk.loadRadius !== "number" || rawChunk.unloadRadius <= rawChunk.loadRadius) {
          add(id, path + ".unloadRadius", "chunk unload radius must exceed load radius");
        }
        if (rawChunk.priority !== undefined &&
            (typeof rawChunk.priority !== "number" || !Number.isFinite(rawChunk.priority))) {
          add(id, path + ".priority", "chunk priority must be finite");
        }
      }
    }

    const assetIds = new Set<string>();
    const occupiedVolumes: Array<{ path: string; bounds: { min: Vec3; max: Vec3 } }> = [];
    if (!Array.isArray(rawRegion.assets)) {
      add(id, "assets", "assets must be an array");
    } else {
      for (const [index, rawAsset] of rawRegion.assets.entries()) {
        const path = "assets[" + index + "]";
        if (!isRecord(rawAsset)) {
          add(id, path, "asset must be an object");
          continue;
        }
        const assetId = typeof rawAsset.id === "string" ? rawAsset.id : "";
        if (!assetId.trim()) add(id, path + ".id", "asset id cannot be empty");
        if (assetIds.has(assetId)) add(id, path + ".id", "duplicate asset id \"" + assetId + "\"");
        if (assetId) assetIds.add(assetId);
        const validAssetPath = (value: unknown) =>
          typeof value === "string" && value.startsWith("/assets/") && value.toLowerCase().endsWith(".glb");
        if (!validAssetPath(rawAsset.src)) add(id, path + ".src", "asset src must be an absolute /assets/*.glb path");
        if (rawAsset.chunkId !== undefined &&
            (typeof rawAsset.chunkId !== "string" || !chunkIds.has(rawAsset.chunkId))) {
          add(id, path + ".chunkId", "asset chunkId must reference a chunk in this region");
        }
        for (const name of ["position", "rotation", "scale"] as const) {
          if (rawAsset[name] !== undefined && !isValidManifestVec3(rawAsset[name])) {
            add(id, path + "." + name, "transform must be a finite 3D vector");
          }
        }
        if (isValidManifestVec3(rawAsset.position) && boundsValid && regionMin && regionMax &&
            rawAsset.position.some((value, axis) => value < regionMin[axis]! || value > regionMax[axis]!)) {
          add(id, path + ".position", "asset origin is outside region bounds");
        }
        if (isValidManifestVec3(rawAsset.scale) && rawAsset.scale.some((value) => value <= 0)) {
          add(id, path + ".scale", "asset scale components must be positive");
        }
        if (rawAsset.occupiedBounds !== undefined) {
          if (!isValidAabb(rawAsset.occupiedBounds)) {
            add(id, path + ".occupiedBounds", "occupied bounds must be a finite, non-empty world-space AABB");
          } else {
            const occupiedBounds = rawAsset.occupiedBounds;
            if (boundsValid && regionMin && regionMax && !aabbInside(occupiedBounds, regionMin, regionMax)) {
              add(id, path + ".occupiedBounds", "occupied bounds extend outside region bounds");
            }
            occupiedVolumes.push({ path: path + ".occupiedBounds", bounds: occupiedBounds });
            for (const [spawnIndex, spawn] of safeSpawns.entries()) {
              if (spawn.position.every((value, axis) => value >= occupiedBounds.min[axis]! && value <= occupiedBounds.max[axis]!)) {
                add(id, "spawns[" + spawnIndex + "].position", "spawn point is inside an asset occupied volume");
              }
            }
          }
        }
        if (rawAsset.lods !== undefined) {
          if (!Array.isArray(rawAsset.lods)) {
            add(id, path + ".lods", "asset LODs must be an array");
          } else {
            let previousDistance = -1;
            for (const [lodIndex, rawLod] of rawAsset.lods.entries()) {
              const lodPath = path + ".lods[" + lodIndex + "]";
              if (!isRecord(rawLod)) {
                add(id, lodPath, "LOD must be an object");
                continue;
              }
              if (!validAssetPath(rawLod.src)) add(id, lodPath + ".src", "LOD src must be an absolute /assets/*.glb path");
              if (typeof rawLod.distance !== "number" || !Number.isFinite(rawLod.distance) ||
                  rawLod.distance <= 0 || rawLod.distance <= previousDistance) {
                add(id, lodPath + ".distance", "LOD distances must be finite, positive and strictly increasing");
              } else previousDistance = rawLod.distance;
              if (rawLod.hysteresis !== undefined &&
                  (typeof rawLod.hysteresis !== "number" || !Number.isFinite(rawLod.hysteresis) ||
                   rawLod.hysteresis < 0 || rawLod.hysteresis >= 1)) {
                add(id, lodPath + ".hysteresis", "LOD hysteresis must be in the range [0, 1)");
              }
            }
          }
        }
        if (rawAsset.instances !== undefined) {
          if (!Array.isArray(rawAsset.instances)) {
            add(id, path + ".instances", "asset instances must be an array");
          } else {
            for (const [instanceIndex, rawInstance] of rawAsset.instances.entries()) {
              const instancePath = path + ".instances[" + instanceIndex + "]";
              if (!isRecord(rawInstance)) {
                add(id, instancePath, "asset instance must be an object");
                continue;
              }
              if (!isValidManifestVec3(rawInstance.position)) {
                add(id, instancePath + ".position", "instance position must be a finite 3D vector");
              } else if (boundsValid && regionMin && regionMax &&
                  rawInstance.position.some((value, axis) => value < regionMin[axis]! || value > regionMax[axis]!)) {
                add(id, instancePath + ".position", "instance origin is outside region bounds");
              }
              if (rawInstance.rotation !== undefined && !isValidManifestVec3(rawInstance.rotation)) add(id, instancePath + ".rotation", "instance rotation must be a finite 3D vector");
              if (rawInstance.occupiedBounds !== undefined) {
                if (!isValidAabb(rawInstance.occupiedBounds)) {
                  add(id, instancePath + ".occupiedBounds", "occupied bounds must be a finite, non-empty world-space AABB");
                } else {
                  const occupiedBounds = rawInstance.occupiedBounds;
                  if (boundsValid && regionMin && regionMax && !aabbInside(occupiedBounds, regionMin, regionMax)) {
                    add(id, instancePath + ".occupiedBounds", "occupied bounds extend outside region bounds");
                  }
                  occupiedVolumes.push({ path: instancePath + ".occupiedBounds", bounds: occupiedBounds });
                  for (const [spawnIndex, spawn] of safeSpawns.entries()) {
                    if (spawn.position.every((value, axis) => value >= occupiedBounds.min[axis]! && value <= occupiedBounds.max[axis]!)) {
                      add(id, "spawns[" + spawnIndex + "].position", "spawn point is inside an asset instance occupied volume");
                    }
                  }
                }
              }
              if (rawInstance.rotation !== undefined && !isValidManifestVec3(rawInstance.rotation)) add(id, instancePath + ".rotation", "instance rotation must be a finite 3D vector");
              if (rawInstance.scale !== undefined && !isValidManifestVec3(rawInstance.scale)) {
                add(id, instancePath + ".scale", "instance scale must be a finite 3D vector");
              } else if (isValidManifestVec3(rawInstance.scale) && rawInstance.scale.some((value) => value <= 0)) {
                add(id, instancePath + ".scale", "instance scale components must be positive");
              }
            }
          }
        }
        if (rawAsset.cullDistance !== undefined &&
            (typeof rawAsset.cullDistance !== "number" || !Number.isFinite(rawAsset.cullDistance) || rawAsset.cullDistance <= 0)) {
          add(id, path + ".cullDistance", "asset cull distance must be finite and positive");
        }
      }
      for (let left = 0; left < occupiedVolumes.length; left += 1) {
        for (let right = left + 1; right < occupiedVolumes.length; right += 1) {
          const a = occupiedVolumes[left]!;
          const b = occupiedVolumes[right]!;
          if (aabbsOverlap(a.bounds, b.bounds)) {
            add(id, b.path, "occupied volume overlaps " + a.path);
          }
        }
      }
    }
    if (rawRegion.navmesh !== undefined &&
        (typeof rawRegion.navmesh !== "string" || !rawRegion.navmesh.startsWith("/assets/navmesh/"))) {
      add(id, "navmesh", "navmesh path must be under /assets/navmesh/");
    }
  }
  return issues;
}
