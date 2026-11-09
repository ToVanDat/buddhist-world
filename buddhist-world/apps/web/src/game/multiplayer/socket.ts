import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS as E, getRegion, getWorldInteraction, type RemotePlayerSnapshot, type Vec3 } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useNet } from "../../stores/net";
import { useGame } from "../../stores/game";
import { playWorldCue, unlockWorldAudio } from "../audio/worldAudio";

export const remoteTargets = new Map<string, RemotePlayerSnapshot>();
export const correction: { position: Vec3 | null } = { position: null };
let socket: Socket | null = null;
let seq = 0;
let wantedRegion: string | null = null;
export function getSocket() { return socket; }

export function connect(regionId: string) {
  if (socket) return;
  wantedRegion = regionId;
  useNet.getState().patch({ status: "connecting", notice: null });
  socket = io({ path: "/socket.io", auth: (cb) => cb({ token: useAuth.getState().accessToken }), reconnectionDelayMax: 5000 });
  socket.on("connect", () => socket!.emit(E.clientJoin, { regionId: wantedRegion }));
  socket.on("disconnect", () => useNet.getState().patch({ status: "reconnecting" }));
  socket.on("connect_error", async (err) => {
    if (err.message === "unauthorized") {
      try { if (await useAuth.getState().refresh()) { socket?.connect(); return; } } catch { /* handled below */ }
    }
    useNet.getState().patch({ status: "error", notice: "Không kết nối được máy chủ." });
  });
  socket.on(E.serverJoined, (m: { regionId: string; position: Vec3; yaw: number }) => {
    remoteTargets.clear(); seq = 0;
    useNet.getState().patch({ status: "in-region", regionId: m.regionId, spawn: { position: m.position, yaw: m.yaw }, remoteIds: [] });
  });
  socket.on(E.serverState, (list: RemotePlayerSnapshot[]) => {
    const ids = new Set(list.map((p) => p.id));
    for (const p of list) remoteTargets.set(p.id, p);
    let changed = false;
    for (const id of [...remoteTargets.keys()]) if (!ids.has(id)) { remoteTargets.delete(id); changed = true; }
    const cur = useNet.getState().remoteIds;
    if (changed || list.length !== cur.length || list.some((p) => !cur.includes(p.id))) useNet.getState().patch({ remoteIds: list.map((p) => p.id) });
  });
  socket.on(E.serverCorrect, (m: { position: Vec3 }) => { correction.position = m.position; });
  socket.on(E.serverChat, (m) => useNet.getState().pushChat(m));
  socket.on(E.serverInteractResult, (m: { targetId: string; at?: number; name: string; response: string; kind: string; questUpdates?: { title: string; completed: boolean }[]; questOffers?: { id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }[] }) => {
    useGame.getState().setLastWorldInteraction({ targetId: m.targetId, at: m.at ?? Date.now() });
    playWorldCue(m.kind);
    const completed = m.questUpdates?.filter((quest) => quest.completed).map((quest) => quest.title) ?? [];
    const questNotice = completed.length ? ` · Hoàn thành nhiệm vụ: ${completed.join(", ")}` : "";
    if (m.kind === "npc") useGame.getState().setNpcDialogue({ name: m.name, response: `${m.response}${questNotice}`, questOffers: m.questOffers ?? [] });
    else useGame.getState().setInteractionMessage(`${m.name}: ${m.response}${questNotice}`);
    setTimeout(() => useGame.getState().setInteractionMessage(null), 5000);
  });
  socket.on(E.serverWorldEvent, (m: { targetId: string; actorId: string; actorName: string; kind: string; at?: number }) => {
    useGame.getState().setLastWorldInteraction({ targetId: m.targetId, at: m.at ?? Date.now() });
    if (m.actorId === useAuth.getState().user?.id) return;
    playWorldCue(m.kind);
    const target = getWorldInteraction(m.targetId);
    useGame.getState().setInteractionMessage(`${m.actorName} đang tương tác với ${target?.name ?? "một vật thể"}.`);
    setTimeout(() => useGame.getState().setInteractionMessage(null), 3500);
  });
  socket.on(E.serverError, (m: { code: string }) => {
    const messages: Record<string, string> = {
      chat_rate_limited: "Bạn nhắn quá nhanh, vui lòng chậm lại.",
      interaction_too_far: "Bạn đang đứng quá xa để tương tác.",
      interaction_cooldown: "Hãy đợi một chút trước khi tương tác lại.",
      interaction_rate_limited: "Bạn thao tác quá nhanh, vui lòng thử lại sau.",
      interaction_unavailable: "Không thể thực hiện tương tác lúc này.",
      quest_reward_inventory_full: "Túi đồ không đủ chỗ nhận toàn bộ phần thưởng. Hãy sử dụng hoặc sắp xếp vật phẩm rồi tương tác lại.",
      quest_reward_invalid: "Phần thưởng nhiệm vụ đang có cấu hình không hợp lệ. Vui lòng báo quản trị viên.",
      voice_unavailable: "Voice chat tạm thời không khả dụng.",
      voice_too_far: "Người chơi đã ở ngoài phạm vi trò chuyện.",
    };
    useNet.getState().patch({ notice: messages[m.code] ?? "Máy chủ từ chối yêu cầu." });
    setTimeout(() => useNet.getState().patch({ notice: null }), 3000);
  });
}
export function switchRegion(regionId: string) {
  if (!getRegion(regionId)) throw new Error("Khu vực không tồn tại.");
  wantedRegion = regionId; remoteTargets.clear();
  useNet.getState().patch({ status: "connecting", regionId, remoteIds: [], spawn: null, notice: null });
  if (socket?.connected) socket.emit(E.clientJoin, { regionId });
}
export function disconnect() {
  socket?.disconnect(); socket = null; remoteTargets.clear();
  useNet.getState().patch({ status: "idle", regionId: null, spawn: null, remoteIds: [], chat: [] });
  const game = useGame.getState();
  game.setWaypoint(null); game.setPlayerPosition(null); game.setNearbyCheckpoint(null);
  game.setCheckpointMessage(null); game.setCheckpointBusy(false); game.setNearbyInteraction(null);
  game.setInteractionMessage(null); game.setNpcDialogue(null); game.setLastWorldInteraction(null);
}
export function sendState(p: Vec3, yaw: number, anim: "idle" | "walk" | "run" | "jump") { socket?.volatile.emit(E.clientState, { p, yaw, anim, seq: ++seq }); }
export function sendChat(text: string) { socket?.emit(E.clientChat, { text }); }
export function sendWorldInteraction(targetId: string) { unlockWorldAudio(); socket?.emit(E.clientInteract, { targetId }); }
