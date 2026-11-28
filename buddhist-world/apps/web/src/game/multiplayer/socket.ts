import { io, type Socket } from "socket.io-client";
import { ANIMATIONS, SOCKET_EVENTS as E, getRegion, getWorldInteraction, worldEnvironmentSnapshotSchema, type RemotePlayerSnapshot, type Vec3 } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useNet } from "../../stores/net";
import { useGame } from "../../stores/game";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { playWorldCue, unlockWorldAudio } from "../audio/worldAudio";
import { InteractionResponseFence, shouldApplyInteractionResult } from "./InteractionResponseFence";
import { NoticeTimeoutFence } from "./NoticeTimeoutFence";
import { shouldAcceptServerJoined } from "./regionJoinFence";
import { shouldAcceptServerCorrection } from "./serverCorrectionFence";

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
  const spatial = target && listener ? { source: target.position, listener } : undefined;
  playWorldCue(kind, spatial);
}

function interactionErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    interaction_unavailable: "Tương tác này hiện chưa khả dụng.",
    interaction_rate_limited: "Bạn thao tác quá nhanh. Hãy thử lại sau.",
    interaction_cooldown: "Hãy chờ một chút trước khi tương tác tiếp.",
    interaction_processing: "Yêu cầu đang được xử lý. Vui lòng đợi.",
    interaction_request_conflict: "Yêu cầu tương tác không hợp lệ.",
    world_content_not_ready: "Nội dung thế giới đang được chuẩn bị.",
    quest_progress_unavailable: "Chưa thể cập nhật tiến trình nhiệm vụ.",
    quest_reward_inventory_full: "Túi đồ đã đầy.",
    chat_rate_limited: "Bạn nhắn quá nhanh, vui lòng chậm lại.",
    join_rate_limited: "Bạn chuyển khu vực quá nhanh. Hãy thử lại sau.",
    bad_region: "Khu vực này không tồn tại.",
    join_unavailable: "Chưa thể vào khu vực. Vui lòng thử lại.",
  };
  return messages[code] ?? "Máy chủ từ chối yêu cầu.";
}

export function connect(regionId: string) {
  if (socket) return;
  wantedRegion = getRegion(regionId)?.id ?? null;
  if (!wantedRegion) {
    useNet.getState().patch({ status: "error", notice: "Khu vực không hợp lệ." });
    return;
  }
  useNet.getState().patch({ status: "connecting", notice: null });
  noticeTimeoutFence.invalidateAll();
  socket = io({
    path: "/socket.io",
    auth: (cb) => cb({ token: useAuth.getState().accessToken }),
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    useNet.getState().patch({ status: "connecting", notice: null });
    socket?.emit(E.clientJoin, { regionId: wantedRegion });
  });
  socket.on("disconnect", () => {
    correction.position = null;
    remoteTargets.clear();
    useNet.getState().patch({ remoteIds: [], status: "reconnecting" });
    interactionResponseFence.clear();
    noticeTimeoutFence.invalidate("interaction");
    noticeTimeoutFence.invalidate("network");
    useGame.getState().setInteractionMessage(null);
    useGame.getState().setNpcRegionSnapshot({ regionId: "__reset__", worldMinute: 0, timeZone: "Asia/Ho_Chi_Minh", npcs: [] });
    useWorldEnvironment.getState().reset();
  });
  socket.on("connect_error", async (err) => {
    if (err.message === "unauthorized") {
      try {
        if (await useAuth.getState().refresh()) { socket?.connect(); return; }
      } catch { /* The user-facing notice below is the recovery path. */ }
    }
    const message = "Không kết nối được máy chủ.";
    useNet.getState().patch({ status: "error", notice: message });
    scheduleNetworkNoticeClear(message, 5000);
  });
  socket.on(E.serverJoined, (m: { regionId: string; position: Vec3; yaw: number }) => {
    if (!shouldAcceptServerJoined(m, wantedRegion) || !getRegion(m.regionId)) return;
    interactionResponseFence.clear();
    noticeTimeoutFence.invalidate("interaction");
    noticeTimeoutFence.invalidate("network");
    useGame.getState().setInteractionMessage(null);
    useGame.getState().setNpcDialogue(null);
    useGame.getState().setNearbyInteraction(null);
    useGame.getState().setNearbyCheckpoint(null);
    // Region switches must not leave NPCs from the previous region rendered.
    useGame.getState().setNpcRegionSnapshot({ regionId: "__reset__", worldMinute: 0, timeZone: "Asia/Ho_Chi_Minh", npcs: [] });
    correction.position = null;
    remoteTargets.clear();
    seq = 0;
    useNet.getState().patch({
      status: "in-region", regionId: m.regionId,
      spawn: { position: m.position, yaw: m.yaw }, remoteIds: [], notice: null,
    });
    useGame.getState().restoreWaypoint(m.regionId);
    // Reload the player's quest state after reconnects and region transitions.
    useGame.getState().refreshQuestTracker();
  });
  socket.on(E.serverState, (raw: RemotePlayerSnapshot[]) => {
    const list = Array.isArray(raw) ? raw.filter((player) =>
      player && typeof player.id === "string" && typeof player.name === "string" &&
      Array.isArray(player.p) && player.p.length === 3 && player.p.every(Number.isFinite) &&
      Number.isFinite(player.yaw) && ANIMATIONS.includes(player.anim),
    ) : [];
    const ids = new Set(list.map((player) => player.id));
    for (const player of list) remoteTargets.set(player.id, player);
    for (const id of [...remoteTargets.keys()]) if (!ids.has(id)) remoteTargets.delete(id);
    const nextIds = list.map((player) => player.id);
    const currentIds = useNet.getState().remoteIds;
    if (nextIds.length !== currentIds.length || nextIds.some((id, index) => id !== currentIds[index])) {
      useNet.getState().patch({ remoteIds: nextIds });
    }
  });
  socket.on(E.serverCorrect, (m: unknown) => {
    if (!shouldAcceptServerCorrection(m, useNet.getState().regionId, seq)) return;
    correction.position = [...m.position];
  });
  socket.on(E.serverChat, (message) => {
    if (message && typeof message.id === "string" && typeof message.from === "string" &&
        typeof message.text === "string" && Number.isFinite(message.at)) useNet.getState().pushChat(message);
  });
  socket.on(E.serverError, (m: { code?: string; requestId?: string; targetId?: string }) => {
    const code = typeof m?.code === "string" ? m.code : "unknown";
    const message = interactionErrorMessage(code);
    if (m.requestId && m.targetId && interactionResponseFence.isCurrent(m.requestId, m.targetId)) {
      interactionResponseFence.consume(m.requestId, m.targetId);
      useGame.getState().setInteractionMessage(message);
      scheduleInteractionNoticeClear(message, 4500);
      return;
    }
    useNet.getState().patch({ notice: message });
    scheduleNetworkNoticeClear(message, 4500);
  });
  socket.on(E.serverInteractResult, (result: {
    targetId: string; requestId?: string; kind: string; name: string; response: string;
    dialogue?: { id: string; text: string }[]; dialogueChoices?: { id: string; label: string }[];
    dialogueNodeId?: string; dialogueNpcId?: string;
    questOffers?: { id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }[];
    questUpdates?: unknown[]; achievementsUnlocked?: unknown[]; at?: number;
  }) => {
    if (!result || typeof result.targetId !== "string" || typeof result.kind !== "string" ||
        typeof result.response !== "string" ||
        !shouldApplyInteractionResult(interactionResponseFence, result)) return;
    const at = Number.isFinite(result.at) ? result.at! : Date.now();
    useGame.getState().setLastWorldInteraction({ targetId: result.targetId, at });
    playInteractionCue(result.kind, result.targetId);
    if (result.kind === "npc") {
      useGame.getState().setNpcDialogue({
        name: typeof result.name === "string" ? result.name : "Nhân vật",
        response: result.response,
        npcId: result.dialogueNpcId,
        nodeId: result.dialogueNodeId,
        choices: result.dialogueChoices ?? [],
        dialogue: result.dialogue ?? [],
        questOffers: result.questOffers ?? [],
      });
    } else {
      useGame.getState().setInteractionMessage(result.response);
      scheduleInteractionNoticeClear(result.response, 6500);
    }
    if ((result.questUpdates?.length ?? 0) > 0 || (result.achievementsUnlocked?.length ?? 0) > 0) {
      useGame.getState().refreshQuestTracker();
    }
  });
  socket.on(E.serverWorldEvent, (event: { targetId?: string; kind?: string; at?: number }) => {
    if (typeof event?.targetId !== "string" || typeof event.kind !== "string") return;
    const at = Number.isFinite(event.at) ? event.at! : Date.now();
    useGame.getState().setLastWorldInteraction({ targetId: event.targetId, at });
    playInteractionCue(event.kind, event.targetId);
  });
  socket.on(E.serverNpcState, (snapshot) => {
    if (!snapshot || typeof snapshot.regionId !== "string" || !getRegion(snapshot.regionId) ||
        !Array.isArray(snapshot.npcs) || snapshot.npcs.some((npc: any) =>
          !npc || typeof npc.id !== "string" || typeof npc.active !== "boolean" ||
          (npc.state && (npc.state.regionId !== snapshot.regionId ||
            !Array.isArray(npc.state.position) || npc.state.position.length !== 3 || !npc.state.position.every(Number.isFinite)))
        )) return;
    useGame.getState().setNpcRegionSnapshot(snapshot);
  });
  socket.on(E.serverEnvironmentState, (raw) => {
    const parsed = worldEnvironmentSnapshotSchema.safeParse(raw);
    if (parsed.success) useWorldEnvironment.getState().setSnapshot(parsed.data);
  });
}

export function disconnect() {
  interactionResponseFence.clear();
  noticeTimeoutFence.invalidateAll();
  socket?.disconnect();
  correction.position = null;
  socket = null;
  wantedRegion = null;
  seq = 0;
  remoteTargets.clear();
  correction.position = null;
  useNet.getState().patch({ status: "idle", regionId: null, spawn: null, remoteIds: [], chat: [], notice: null });
  useGame.getState().setInteractionMessage(null);
  useGame.getState().setNpcDialogue(null);
  useGame.getState().setNpcRegionSnapshot({ regionId: "__reset__", worldMinute: 0, timeZone: "Asia/Ho_Chi_Minh", npcs: [] });
  useWorldEnvironment.getState().reset();
}

export function sendState(p: Vec3, yaw: number, anim: (typeof ANIMATIONS)[number]) {
  socket?.volatile.emit(E.clientState, { p, yaw, anim, seq: ++seq });
}
export function sendChat(text: string) {
  const trimmed = text.trim();
  if (trimmed) socket?.emit(E.clientChat, { text: trimmed });
}
export function sendWorldInteraction(targetId: string) {
  const target = getWorldInteraction(targetId);
  if (!socket?.connected || !target || target.regionId !== useNet.getState().regionId) return;
  const requestId = crypto.randomUUID();
  interactionResponseFence.begin(requestId, targetId);
  unlockWorldAudio();
  socket.emit(E.clientInteract, { targetId, requestId });
}
