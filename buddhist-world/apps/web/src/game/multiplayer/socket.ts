import { io, type Socket } from "socket.io-client";
import { ANIMATIONS, SOCKET_EVENTS as E, getRegion, getWorldInteraction, worldEnvironmentSnapshotSchema, type RemotePlayerSnapshot, type Vec3 } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useNet } from "../../stores/net";
import { useGame } from "../../stores/game";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { playWorldCue, unlockWorldAudio } from "../audio/worldAudio";
import { InteractionResponseFence, shouldApplyInteractionResult } from "./InteractionResponseFence";
import { NoticeTimeoutFence } from "./NoticeTimeoutFence";

export const remoteTargets = new Map<string, RemotePlayerSnapshot>();
export const correction: { position: Vec3 | null } = { position: null };
let socket: Socket | null = null;
let seq = 0;
let wantedRegion: string | null = null;
const interactionResponseFence = new InteractionResponseFence();
const noticeTimeoutFence = new NoticeTimeoutFence();

function scheduleInteractionNoticeClear(message: string, delayMs: number) {
  noticeTimeoutFence.schedule("interaction", delayMs, () => {
    if (useGame.getState().interactionMessage === message) useGame.getState().setInteractionMessage(null);
  });
}
function scheduleNetworkNoticeClear(message: string, delayMs: number) {
  noticeTimeoutFence.schedule("network", delayMs, () => {
    if (useNet.getState().notice === message) useNet.getState().patch({ notice: null });
  });
}
export function getSocket() { return socket; }

function playInteractionCue(kind: string, targetId: string) {
  const target = getWorldInteraction(targetId);
  const listener = useGame.getState().playerPosition;
  const spatial = target && listener
    ? { source: target.position, listener }
    : undefined;
  playWorldCue(kind, spatial);
}

export function connect(regionId: string) {
  if (socket) return;
  wantedRegion = regionId;
  useNet.getState().patch({ status: "connecting", notice: null });
  noticeTimeoutFence.invalidateAll();
  socket = io({ path: "/socket.io", auth: (cb) => cb({ token: useAuth.getState().accessToken }), reconnectionDelayMax: 5000 });
  socket.on("connect", () => {
    useNet.getState().patch({ status: "connecting" });
    socket!.emit(E.clientJoin, { regionId: wantedRegion });
  });
  socket.on("disconnect", () => {
    remoteTargets.clear();
    useNet.getState().patch({ remoteIds: [] });
    interactionResponseFence.clear();
    noticeTimeoutFence.invalidate("interaction");
    noticeTimeoutFence.invalidate("network");
    useGame.getState().setInteractionMessage(null);
    useNet.getState().patch({ status: "reconnecting", notice: null });
  });
  socket.on("connect_error", async (err) => {
    if (err.message === "unauthorized") {
      try { if (await useAuth.getState().refresh()) { socket?.connect(); return; } } catch { /* handled below */ }
    }
    const message = "Không kết nối được máy chủ.";
    useNet.getState().patch({ status: "error", notice: message });
    scheduleNetworkNoticeClear(message, 5000);
  });
  socket.on(E.serverJoined, (m: { regionId: string; position: Vec3; yaw: number }) => {
    interactionResponseFence.clear();
    noticeTimeoutFence.invalidate("interaction");
    noticeTimeoutFence.invalidate("network");
    useGame.getState().setInteractionMessage(null);
    remoteTargets.clear(); seq = 0;
    useNet.getState().patch({ status: "in-region", regionId: m.regionId, spawn: { position: m.position, yaw: m.yaw }, remoteIds: [], notice: null });
    useGame.getState().restoreWaypoint(m.regionId);
  });
  socket.on(E.serverState, (list: RemotePlayerSnapshot[]) => {
