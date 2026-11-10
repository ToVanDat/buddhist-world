import type { Vec3 } from "./types.js";

export type NpcActivity = "idle" | "walk" | "work" | "pray" | "talk" | "rest";
export interface NpcScheduleState {
  id: string;
  startMinute: number;
  endMinute: number;
  regionId: string;
  position: Vec3;
  heading?: number;
  activity: NpcActivity;
  dialogueId?: string;
}
export interface NpcWorldSnapshot {
  id: string;
  name: string;
  title: string;
  active: boolean;
  state: NpcScheduleState | null;
  nextChangeMinute: number | null;
}
export interface NpcRegionSnapshot {
  regionId: string;
  worldMinute: number;
  timeZone: "Asia/Ho_Chi_Minh";
  npcs: NpcWorldSnapshot[];
}
