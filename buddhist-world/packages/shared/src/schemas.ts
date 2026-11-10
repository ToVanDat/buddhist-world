import { z } from "zod";
import { ANIMATIONS, CHAT_MAX_LEN } from "./constants.js";

export const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const animationId = z.enum(ANIMATIONS);
export const registerBody = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  username: z.string().regex(/^[\p{L}\p{N}_-]{3,24}$/u, "3-24 ký tự: chữ, số, _ hoặc -"),
  password: z.string().min(10, "Tối thiểu 10 ký tự").max(128),
});
export const loginBody = z.object({ email: z.string().email().transform((s) => s.toLowerCase()), password: z.string().min(1).max(128) });
export const checkpointBody = z.object({ regionId: z.string().min(1).max(64), spawnId: z.string().min(1).max(64) });
export const profileBody = z.object({
  displayName: z.string().trim().min(2, "Tên hiển thị cần ít nhất 2 ký tự").max(32, "Tên hiển thị tối đa 32 ký tự")
    .regex(/^[\p{L}\p{M}\p{N} _.'-]+$/u, "Tên hiển thị chứa ký tự không được hỗ trợ"),
});
export const joinRegionPayload = z.object({ regionId: z.string().min(1).max(64) });
export const playerStatePayload = z.object({ p: vec3, yaw: z.number().finite(), anim: animationId, seq: z.number().int().nonnegative() });
export const chatSendPayload = z.object({ text: z.string().trim().min(1).max(CHAT_MAX_LEN) });
export const worldInteractionPayload = z.object({ targetId: z.string().min(1).max(64) });
export const voiceActivityPayload = z.object({ active: z.boolean() });
export const voiceSignalPayload = z.object({
  targetId: z.string().uuid(),
  type: z.enum(["offer", "answer", "candidate"]),
  sdp: z.string().max(16_000).optional(),
  candidate: z.string().max(4_096).optional(),
  sdpMid: z.string().max(128).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(255).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.type === "candidate" && !value.candidate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["candidate"], message: "ICE candidate is required" });
  if (value.type !== "candidate" && !value.sdp) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sdp"], message: "Session description is required" });
});
export type PlayerStatePayload = z.infer<typeof playerStatePayload>;
export interface RemotePlayerSnapshot { id: string; name: string; p: [number, number, number]; yaw: number; anim: (typeof ANIMATIONS)[number] }
export interface ChatMessage { id: string; from: string; text: string; at: number }
export const SOCKET_EVENTS = {
  clientJoin: "region:join", clientState: "player:state", clientChat: "chat:send", clientInteract: "world:interact",
  clientVoiceSignal: "voice:signal", clientVoiceActivity: "voice:activity", serverVoiceActivity: "voice:activity", serverJoined: "region:joined", serverState: "world:state",
  serverCorrect: "player:correct", serverChat: "chat:message", serverError: "app:error",
  serverInteractResult: "world:interact:result", serverWorldEvent: "world:event", serverNpcState: "world:npcs:state",
  serverVoicePeers: "voice:peers", serverVoiceSignal: "voice:signal",
} as const;


export const worldLightingPreset = z.enum(["dawn", "day", "sunset", "night"]);
export const worldWeather = z.enum(["clear", "cloudy", "rain", "fog"]);
export const worldEnvironmentSnapshotSchema = z.object({
  serverTimeMs: z.number().int().nonnegative(),
  worldMinute: z.number().int().min(0).max(1439),
  worldSecond: z.number().int().min(0).max(59),
  preset: worldLightingPreset,
  fromPreset: worldLightingPreset,
  toPreset: worldLightingPreset,
  transition: z.number().min(0).max(1),
  weather: worldWeather,
  weatherIntensity: z.number().min(0).max(1),
});
export type WorldEnvironmentSnapshot = z.infer<typeof worldEnvironmentSnapshotSchema>;
