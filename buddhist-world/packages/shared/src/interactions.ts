import type { Vec3 } from "./types.js";
import { TEMPLE_LAYOUT, offsetFromAnchor } from "./templeLayout.js";

export type WorldInteractionKind = "bell" | "incense" | "buddha" | "altar" | "npc";
export interface WorldInteractionDef {
  id: string;
  regionId: string;
  kind: WorldInteractionKind;
  name: string;
  prompt: string;
  position: Vec3;
  radius: number;
  cooldownMs: number;
  /** Server-authored response; never accept display text from the client. */
  response: string;
}

/**
 * First interaction registry for the current fictional temple blockout.
 * Coordinates are world-space metres (Y-up), aligned with temple_complex.
 * Replace proxy coordinates after final Blender assets are integrated.
 */
export const WORLD_INTERACTIONS: readonly WorldInteractionDef[] = [
  { id: "temple_bell", regionId: "temple_complex", kind: "bell", name: "Chuông chùa", prompt: "E · Lắng nghe tiếng chuông", position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [5, 1.2, 3]), radius: 3, cooldownMs: 8_000, response: "Tiếng chuông chùa thường gắn với thời khóa và lời nhắc trở về sự chú tâm. Âm thanh trong bản demo là hiệu ứng mô phỏng, không phải bản thu nghi lễ." },
  { id: "incense_burner", regionId: "temple_complex", kind: "incense", name: "Lư hương", prompt: "E · Tìm hiểu lư hương", position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [0, 1.2, -2]), radius: 2.5, cooldownMs: 3_000, response: "Nén hương thường biểu trưng cho lòng thành kính và sự tưởng niệm. Hãy tìm hiểu phong tục cụ thể của ngôi chùa khi tham quan thực tế." },
  { id: "buddha_statue", regionId: "temple_complex", kind: "buddha", name: "Tượng Phật", prompt: "E · Tìm hiểu tôn tượng", position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [0, 1.2, -7]), radius: 2.5, cooldownMs: 5_000, response: "Tôn tượng nhắc người hành hương nhớ đến Đức Phật và những lời dạy. Hình tượng, thủ ấn và cách bài trí có thể mang ý nghĩa riêng theo truyền thống." },
  { id: "main_altar", regionId: "temple_complex", kind: "altar", name: "Bàn thờ chính điện", prompt: "E · Tìm hiểu bàn thờ", position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [3, 1.2, -4.5]), radius: 2.5, cooldownMs: 5_000, response: "Bàn thờ chính điện là không gian tôn nghiêm. Khi tham quan, hãy giữ trật tự, không tự ý chạm vào pháp khí hoặc đồ thờ và làm theo hướng dẫn của nhà chùa." },
  { id: "monk_guide", regionId: "temple_complex", kind: "npc", name: "Chú tiểu hướng dẫn", prompt: "E · Trò chuyện", position: TEMPLE_LAYOUT.npcGuideFallback.position, radius: 3, cooldownMs: 1_500, response: "Nam mô A Di Đà Phật. Chào mừng bạn đến thăm chùa. Bạn có thể bắt đầu ở Tam Quan, thong thả qua sân chùa, ghé chính điện rồi kết thúc bên hồ sen. Xin giữ lời nói nhẹ nhàng và tôn trọng người đang hành lễ. Đây là hành trình gợi ý; bạn vẫn có thể tự do khám phá." },
] as const;

export const getWorldInteraction = (id: string): WorldInteractionDef | undefined =>
  WORLD_INTERACTIONS.find((item) => item.id === id);
