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
  /** Optional streaming chunk that owns this asset. Unassigned assets remain region-resident. */
  chunkId?: string;
}
export interface RegionAssetInstanceDef { position: Vec3; rotation?: Vec3; scale?: Vec3 }
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
      {
        id: "main_entrance",
        name: "Tam Quan",
        description: "Cổng Tam Quan là ngưỡng bước vào không gian chùa. Hãy dừng lại quan sát bố cục cổng, mái và các chi tiết trang trí; ý nghĩa cụ thể của từng lối đi có thể khác nhau giữa các ngôi chùa.",
        ...TEMPLE_LAYOUT.spawns.mainEntrance,
      },
      {
        id: "courtyard",
        name: "Sân chùa",
        description: "Sân chùa kết nối các công trình và tạo khoảng không cho sinh hoạt chung. Bạn có thể thong thả quan sát trục kiến trúc, hàng cây và khoảng sân trước khi tiến vào chính điện.",
        ...TEMPLE_LAYOUT.spawns.courtyard,
      },
      {
        id: "main_hall",
        name: "Chính điện",
        description: "Chính điện thường là không gian thờ tự quan trọng của ngôi chùa. Khi tham quan, hãy giữ giọng nói nhỏ, tôn trọng người đang hành lễ và quan sát cách bố trí tôn tượng cùng bàn thờ.",
        ...TEMPLE_LAYOUT.spawns.mainHall,
      },
      {
        id: "lotus_pond",
        name: "Hồ sen",
        description: "Hồ sen tạo nên một khoảng lắng giữa cảnh quan. Trong nhiều truyền thống Phật giáo, hoa sen gợi nhắc sự thanh khiết và khả năng vươn lên giữa bùn; hãy dành một chút thời gian quan sát mặt nước và nhịp chuyển động của lá.",
        ...TEMPLE_LAYOUT.spawns.lotusPond,
      },
    ],
    defaultSpawn: "main_entrance",
    assets: [],
    navmesh: "/assets/navmesh/temple_complex.json",
    blockout: true,
  },
};

export const DEFAULT_REGION_ID = "temple_complex";
export const getRegion = (id: string): RegionDef | undefined => REGIONS[id];

export interface RegionManifestIssue { regionId: string; path: string; message: string }
const isFiniteVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && Number.isFinite(part));

/**
 * Validate region metadata without requiring any Blender/GLB files.
 * This is deliberately a data-contract check, not an asset/runtime validator.
 */
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const isValidManifestVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && Number.isFinite(part));

/** Validate untrusted region data without dereferencing malformed nested values. */
export function validateRegionManifest(input: unknown): RegionManifestIssue[] {
  const issues: RegionManifestIssue[] = [];
  const add = (regionId: string, path: string, message: string) => issues.push({ regionId, path, message });
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
    if (regionMin === null || regionMax === null) add(id, "bounds", "bounds min/max must be finite 3D vectors");
    else {
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
    if (!Array.isArray(rawRegion.spawns)) add(id, "spawns", "spawns must be an array");
    else {
      if (rawRegion.spawns.length === 0) add(id, "spawns", "region must define at least one spawn point");
      for (const [index, rawSpawn] of rawRegion.spawns.entries()) {
        const path = "spawns[" + index + "]";
        if (!isRecord(rawSpawn)) { add(id, path, "spawn must be an object"); continue; }
        const spawnId = typeof rawSpawn.id === "string" ? rawSpawn.id : "";
        if (!spawnId.trim()) add(id, path + ".id", "spawn id cannot be empty");
        if (spawnIds.has(spawnId)) add(id, path + ".id", "duplicate spawn id \"" + spawnId + "\"");
        if (spawnId) spawnIds.add(spawnId);
        if (typeof rawSpawn.name !== "string") add(id, path + ".name", "spawn name must be a string");
        if (typeof rawSpawn.description !== "string" || !rawSpawn.description.trim()) add(id, path + ".description", "spawn description must be a non-empty string");
        const position = isValidManifestVec3(rawSpawn.position) ? rawSpawn.position : null;
        if (!position) add(id, path + ".position", "position must be a finite 3D vector");
        else if (boundsValid && regionMin && regionMax && position.some((part, axis) => part < regionMin[axis]! || part > regionMax[axis]!)) add(id, path + ".position", "spawn must be inside region bounds");
        if (typeof rawSpawn.yaw !== "number" || !Number.isFinite(rawSpawn.yaw)) add(id, path + ".yaw", "yaw must be finite");
        if (position && typeof rawSpawn.name === "string" && typeof rawSpawn.description === "string" && typeof rawSpawn.yaw === "number") {
          safeSpawns.push({ id: spawnId, name: rawSpawn.name, description: rawSpawn.description, position, yaw: rawSpawn.yaw });
        }
      }
    }
    if (typeof rawRegion.defaultSpawn !== "string" || !spawnIds.has(rawRegion.defaultSpawn)) add(id, "defaultSpawn", "defaultSpawn must reference a known spawn");
    if (boundsValid && safeSpawns.length) {
      for (const issue of validateTempleSpawnSafety(safeSpawns, id)) add(id, "spawns", issue);
    }
    if (!Array.isArray(rawRegion.assets)) add(id, "assets", "assets must be an array");
  }
  return issues;
}
