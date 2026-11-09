import type { Vec3 } from "./types.js";

export interface SpawnPoint { id: string; name: string; description: string; position: Vec3; yaw: number }
export interface RegionDef {
  id: string;
  name: string;
  /** Hộp giới hạn AABB trong tọa độ thế giới (Y-up, mét). */
  bounds: { min: Vec3; max: Vec3 };
  spawns: SpawnPoint[];
  defaultSpawn: string;
  /** Asset GLB cần tải (đường dẫn dưới /assets). Rỗng = dùng placeholder. */
  assets: string[];
}

/** Manifest region. Thêm region mới = thêm một phần tử, không sửa hệ thống khác. */
export const REGIONS: Record<string, RegionDef> = {
  temple_complex: {
    id: "temple_complex",
    name: "Khuôn viên chùa",
    bounds: { min: [-120, -5, -120], max: [120, 60, 120] },
    spawns: [
      { id: "main_entrance", name: "Tam Quan", description: "Cổng tam quan – lối vào khuôn viên", position: [0, 1.2, 40], yaw: Math.PI },
      { id: "courtyard", name: "Sân chùa", description: "Khoảng sân yên tĩnh giữa khuôn viên", position: [0, 1.2, 0], yaw: Math.PI },
      { id: "main_hall", name: "Chính điện", description: "Không gian chiêm bái tại chính điện", position: [0, 1.2, -13], yaw: Math.PI },
      { id: "lotus_pond", name: "Hồ sen", description: "Lối dạo cạnh hồ sen", position: [-18, 1.2, 4], yaw: Math.PI / 2 },
    ],
    defaultSpawn: "main_entrance",
    assets: [],
  },
};

export const DEFAULT_REGION_ID = "temple_complex";
export const getRegion = (id: string): RegionDef | undefined => REGIONS[id];
