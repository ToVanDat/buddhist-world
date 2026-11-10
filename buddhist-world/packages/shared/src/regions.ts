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
