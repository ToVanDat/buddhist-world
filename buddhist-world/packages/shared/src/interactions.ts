import type { Vec3 } from "./types.js";

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
  { id: "temple_bell", regionId: "temple_complex", kind: "bell", name: "Chuông chùa", prompt: "E · Thỉnh chuông", position: [5, 1.2, -19], radius: 3, cooldownMs: 8_000, response: "Tiếng chuông ngân vang trong khuôn viên chùa." },
  { id: "incense_burner", regionId: "temple_complex", kind: "incense", name: "Lư hương", prompt: "E · Dâng hương", position: [0, 1.2, -25], radius: 2.5, cooldownMs: 3_000, response: "Bạn thành kính dâng một nén hương." },
  { id: "buddha_statue", regionId: "temple_complex", kind: "buddha", name: "Tượng Phật", prompt: "E · Chiêm bái", position: [0, 1.2, -29], radius: 2.5, cooldownMs: 5_000, response: "Bạn dành một phút tĩnh tâm trước tôn tượng." },
  { id: "main_altar", regionId: "temple_complex", kind: "altar", name: "Bàn thờ chính điện", prompt: "E · Thành kính lễ Phật", position: [0, 1.2, -26.5], radius: 2.5, cooldownMs: 5_000, response: "Bạn cúi đầu thành kính tại chính điện." },
  { id: "monk_guide", regionId: "temple_complex", kind: "npc", name: "Chú tiểu hướng dẫn", prompt: "E · Trò chuyện", position: [4, 1.2, -17], radius: 3, cooldownMs: 1_500, response: "Nam mô A Di Đà Phật. Chào mừng bạn đến thăm chùa. Hãy bắt đầu từ Tam Quan, dạo quanh hồ sen rồi ghé chính điện nhé." },
] as const;

export const getWorldInteraction = (id: string): WorldInteractionDef | undefined =>
  WORLD_INTERACTIONS.find((item) => item.id === id);
