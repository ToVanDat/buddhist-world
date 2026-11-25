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
  socket.on(E.serverNpcState, (snapshot) => useGame.getState().setNpcRegionSnapshot(snapshot));
  socket.on(E.serverEnvironmentState, (raw) => {
    const parsed = worldEnvironmentSnapshotSchema.safeParse(raw);
    if (parsed.success) useWorldEnvironment.getState().setSnapshot(parsed.data);
  });
  socket.on(E.serverChat, (m) => useNet.getState().pushChat(m));
  socket.on(E.serverInteractResult, (m: { targetId: string; requestId?: string; at?: number; name: string; response: string; kind: string; dialogue?: { id: string; text: string }[]; dialogueChoices?: { id: string; label: string }[]; dialogueNodeId?: string; dialogueNpcId?: string; questUpdates?: { title: string; completed: boolean }[]; questOffers?: { id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }[]; achievementsUnlocked?: { id: string; title: string; description: string; icon: string }[] }) => {
    if (!shouldApplyInteractionResult(interactionResponseFence, m)) return;
    useGame.getState().setLastWorldInteraction({ targetId: m.targetId, at: m.at ?? Date.now() });
    playInteractionCue(m.kind, m.targetId);
    const completed = m.questUpdates?.filter((quest) => quest.completed).map((quest) => quest.title) ?? [];
    const achievementTitles = m.achievementsUnlocked?.map((achievement) => achievement.title) ?? [];
    const notices = [
      ...(completed.length ? [`Hoàn thành nhiệm vụ: ${completed.join(", ")}`] : []),
      ...(achievementTitles.length ? [`Thành tựu mới: ${achievementTitles.join(", ")}`] : []),
    ];
    const completionNotice = notices.length ? notices.join(" · ") : undefined;
    const questNotice = completionNotice ? ` · ${completionNotice}` : "";
    if (m.kind === "npc") useGame.getState().setNpcDialogue({
      name: m.name, response: m.response, dialogue: m.dialogue ?? [],
      npcId: m.dialogueNpcId, nodeId: m.dialogueNodeId, choices: m.dialogueChoices ?? [],
      completionNotice,
      questOffers: m.questOffers ?? [],
    });
    else useGame.getState().setInteractionMessage(`${m.name}: ${m.response}${questNotice}`);
    scheduleInteractionNoticeClear(`${m.name}: ${m.response}${questNotice}`, 5000);
  });
  socket.on(E.serverWorldEvent, (m: { targetId: string; actorId: string; actorName: string; kind: string; at?: number }) => {
    if (m.actorId === useAuth.getState().user?.id) {
      useGame.getState().setLastWorldInteraction({ targetId: m.targetId, at: m.at ?? Date.now() });
      return;
    }
    playInteractionCue(m.kind, m.targetId);
    const target = getWorldInteraction(m.targetId);
    useGame.getState().setInteractionMessage(`${m.actorName} đang tương tác với ${target?.name ?? "một vật thể"}.`);
    scheduleInteractionNoticeClear(`${m.actorName} đang tương tác với ${target?.name ?? "một vật thể"}.`, 3500);
  });
  socket.on(E.serverError, (m: { code: string; requestId?: string; targetId?: string }) => {
    const interactionErrors = new Set([
      "interaction_too_far", "interaction_cooldown", "interaction_rate_limited",
      "interaction_unavailable", "interaction_duplicate", "interaction_processing", "interaction_request_conflict",
      "world_content_not_ready", "quest_progress_unavailable",
      "quest_reward_inventory_full", "quest_reward_invalid", "quest_definition_invalid",
    ]);
    if (interactionErrors.has(m.code) && !interactionResponseFence.isCurrent(m.requestId, m.targetId ?? "")) return;
    const terminalInteractionErrors = new Set([
      "interaction_too_far", "interaction_cooldown", "interaction_rate_limited", "interaction_unavailable",
      "interaction_duplicate", "interaction_processing", "interaction_request_conflict",
      "world_content_not_ready", "quest_progress_unavailable",
      "quest_reward_inventory_full", "quest_reward_invalid", "quest_definition_invalid",
    ]);
    if (terminalInteractionErrors.has(m.code)) interactionResponseFence.consume(m.requestId, m.targetId ?? "");
    const messages: Record<string, string> = {
      chat_rate_limited: "Bạn nhắn quá nhanh, vui lòng chậm lại.",
      join_rate_limited: "Bạn chuyển khu vực quá nhanh, vui lòng thử lại sau.",
      interaction_too_far: "Bạn đang đứng quá xa để tương tác.",
      interaction_cooldown: "Hãy đợi một chút trước khi tương tác lại.",
      interaction_rate_limited: "Bạn thao tác quá nhanh, vui lòng thử lại sau.",
      interaction_unavailable: "Không thể thực hiện tương tác lúc này.",
      interaction_duplicate: "Yêu cầu tương tác này đã được xử lý.",
      interaction_processing: "Yêu cầu đang được xử lý. Vui lòng chờ một chút.",
      interaction_request_conflict: "Yêu cầu tương tác không hợp lệ. Vui lòng thử lại.",
      world_content_not_ready: "Dữ liệu nhiệm vụ chưa sẵn sàng. Vui lòng thử lại sau khi hệ thống được cập nhật.",
      quest_progress_unavailable: "Chưa thể lưu tiến trình nhiệm vụ. Vui lòng thử lại.",
      quest_definition_invalid: "Dữ liệu mục tiêu hoặc tiến trình nhiệm vụ không hợp lệ. Vui lòng báo quản trị viên.",
      quest_reward_inventory_full: "Túi đồ không đủ chỗ nhận toàn bộ phần thưởng. Hãy sử dụng hoặc sắp xếp vật phẩm rồi tương tác lại.",
      quest_reward_invalid: "Phần thưởng nhiệm vụ đang có cấu hình không hợp lệ. Vui lòng báo quản trị viên.",
      voice_unavailable: "Voice chat tạm thời không khả dụng.",
      voice_too_far: "Người chơi đã ở ngoài phạm vi trò chuyện.",
    };
    useNet.getState().patch({ notice: messages[m.code] ?? "Máy chủ từ chối yêu cầu." });
    scheduleNetworkNoticeClear(messages[m.code] ?? "Máy chủ từ chối yêu cầu.", 3000);
  });
}
export function switchRegion(regionId: string) {
  if (!getRegion(regionId)) throw new Error("Khu vực không tồn tại.");
  wantedRegion = regionId;
  remoteTargets.clear();
  interactionResponseFence.clear();
  noticeTimeoutFence.invalidate("interaction");
  noticeTimeoutFence.invalidate("network");
  useGame.getState().setInteractionMessage(null);
  useGame.getState().setNpcDialogue(null);
  useGame.getState().setLastWorldInteraction(null);
  useNet.getState().patch({ status: "connecting", regionId, remoteIds: [], spawn: null, notice: null });
  if (socket?.connected) socket.emit(E.clientJoin, { regionId });
}
export function disconnect() {
  socket?.disconnect(); socket = null; remoteTargets.clear(); interactionResponseFence.clear();
  noticeTimeoutFence.invalidateAll();
  useWorldEnvironment.getState().reset();
  useNet.getState().patch({ status: "idle", regionId: null, spawn: null, remoteIds: [], chat: [] });
  const game = useGame.getState();
  game.setWaypoint(null); game.setPlayerPosition(null); game.setNearbyCheckpoint(null);
  game.setCheckpointMessage(null); game.setCheckpointBusy(false); game.setNearbyInteraction(null);
  game.setInteractionMessage(null); game.setNpcDialogue(null); game.setLastWorldInteraction(null);
  game.setNpcRegionSnapshot({ regionId: "__reset__", worldMinute: 0, timeZone: "Asia/Ho_Chi_Minh", npcs: [] });
}
export function sendState(p: Vec3, yaw: number, anim: (typeof ANIMATIONS)[number]) { socket?.volatile.emit(E.clientState, { p, yaw, anim, seq: ++seq }); }
export function sendChat(text: string) { socket?.emit(E.clientChat, { text }); }
export function sendWorldInteraction(targetId: string) {
  if (!socket?.connected) {
    const message = "Bạn vẫn có thể tự do khám phá, nhưng cần kết nối máy chủ để thực hiện tương tác này.";
    useNet.getState().patch({ notice: message });
    scheduleNetworkNoticeClear(message, 3500);
    return false;
  }
  unlockWorldAudio();
  const requestId = crypto.randomUUID();
  interactionResponseFence.begin(requestId, targetId);
  socket.emit(E.clientInteract, { targetId, requestId });
  return true;
}
