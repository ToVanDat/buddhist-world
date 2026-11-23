import type { Server as SocketServer } from "socket.io";

let realtimeServer: SocketServer | null = null;

export function bindRealtimeServer(server: SocketServer | null) {
  realtimeServer = server;
}

/** Emit to the currently authenticated player room; durable state remains in PostgreSQL. */
export function emitToUser(userId: string, event: string, payload: unknown) {
  realtimeServer?.to(`player:${userId}`).emit(event, payload);
}
