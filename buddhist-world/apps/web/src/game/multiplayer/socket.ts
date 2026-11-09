import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS as E, type RemotePlayerSnapshot, type Vec3 } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useNet } from "../../stores/net";

/** Mục tiêu nội suy của người chơi khác – mutable, ngoài React. */
export const remoteTargets = new Map<string, RemotePlayerSnapshot>();
/** Server yêu cầu đặt lại vị trí (anti-cheat / lệch pha). Controller đọc và xoá mỗi frame. */
export const correction: { position: Vec3 | null } = { position: null };

let socket: Socket | null = null;
let seq = 0;
let wantedRegion: string | null = null;

export function connect(regionId: string) {
  if (socket) return;
  wantedRegion = regionId;
  const net = useNet.getState();
  net.patch({ status: "connecting", notice: null });

  socket = io({
    path: "/socket.io",
    // Hàm → lấy token mới nhất mỗi lần (re)connect.
    auth: (cb) => cb({ token: useAuth.getState().accessToken }),
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => socket!.emit(E.clientJoin, { regionId: wantedRegion }));
  socket.on("disconnect", () => useNet.getState().patch({ status: "reconnecting" }));
  socket.on("connect_error", async (err) => {
    if (err.message === "unauthorized" && (await useAuth.getState().refresh())) { socket?.connect(); return; }
    useNet.getState().patch({ status: "error", notice: "Không kết nối được máy chủ." });
  });

  socket.on(E.serverJoined, (m: { regionId: string; position: Vec3; yaw: number }) => {
    remoteTargets.clear();
    seq = 0;
    useNet.getState().patch({ status: "in-region", regionId: m.regionId, spawn: { position: m.position, yaw: m.yaw }, remoteIds: [] });
  });
  socket.on(E.serverState, (list: RemotePlayerSnapshot[]) => {
    const ids = new Set(list.map((p) => p.id));
    for (const p of list) remoteTargets.set(p.id, p);
    let changed = false;
    for (const id of [...remoteTargets.keys()]) if (!ids.has(id)) { remoteTargets.delete(id); changed = true; }
    const cur = useNet.getState().remoteIds;
    if (changed || list.length !== cur.length || list.some((p) => !cur.includes(p.id))) {
      useNet.getState().patch({ remoteIds: list.map((p) => p.id) });
    }
  });
  socket.on(E.serverCorrect, (m: { position: Vec3 }) => { correction.position = m.position; });
  socket.on(E.serverChat, (m) => useNet.getState().pushChat(m));
  socket.on(E.serverError, (m: { code: string }) => {
    const text = m.code === "chat_rate_limited" ? "Bạn nhắn quá nhanh, vui lòng chậm lại." : "Máy chủ từ chối yêu cầu.";
    useNet.getState().patch({ notice: text });
    setTimeout(() => useNet.getState().patch({ notice: null }), 3000);
  });
}

export function disconnect() {
  socket?.disconnect(); socket = null; remoteTargets.clear();
  useNet.getState().patch({ status: "idle", regionId: null, spawn: null, remoteIds: [], chat: [] });
}

export function sendState(p: Vec3, yaw: number, anim: "idle" | "walk" | "run" | "jump") {
  socket?.volatile.emit(E.clientState, { p, yaw, anim, seq: ++seq });
}
export function sendChat(text: string) { socket?.emit(E.clientChat, { text }); }
