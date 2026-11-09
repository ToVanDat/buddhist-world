import { z } from "zod";
import { ANIMATIONS, CHAT_MAX_LEN } from "./constants.js";

export const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const animationId = z.enum(ANIMATIONS);

// ---------- REST ----------
export const registerBody = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  username: z.string().regex(/^[\p{L}\p{N}_-]{3,24}$/u, "3-24 ký tự: chữ, số, _ hoặc -"),
  password: z.string().min(10, "Tối thiểu 10 ký tự").max(128),
});
export const loginBody = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const checkpointBody = z.object({
  regionId: z.string().min(1).max(64),
  spawnId: z.string().min(1).max(64),
});

export const profileBody = z.object({
  displayName: z.string()
    .trim()
    .min(2, "Tên hiển thị cần ít nhất 2 ký tự")
    .max(32, "Tên hiển thị tối đa 32 ký tự")
    .regex(/^[\p{L}\p{M}\p{N} _.'-]+$/u, "Tên hiển thị chứa ký tự không được hỗ trợ"),
});

// ---------- Socket ----------
export const joinRegionPayload = z.object({ regionId: z.string().min(1).max(64) });
export const playerStatePayload = z.object({
  p: vec3,
  yaw: z.number().finite(),
  anim: animationId,
  seq: z.number().int().nonnegative(),
});
export const chatSendPayload = z.object({ text: z.string().trim().min(1).max(CHAT_MAX_LEN) });

export type PlayerStatePayload = z.infer<typeof playerStatePayload>;

/** Snapshot rút gọn cho người chơi khác. */
export interface RemotePlayerSnapshot {
  id: string;        // userId
  name: string;
  p: [number, number, number];
  yaw: number;
  anim: (typeof ANIMATIONS)[number];
}

export interface ChatMessage { id: string; from: string; text: string; at: number }

export const SOCKET_EVENTS = {
  clientJoin: "region:join",
  clientState: "player:state",
  clientChat: "chat:send",
  serverJoined: "region:joined",
  serverState: "world:state",
  serverCorrect: "player:correct",
  serverChat: "chat:message",
  serverError: "app:error",
} as const;
