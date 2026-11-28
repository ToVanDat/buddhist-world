import { CHAT_MAX_LEN, getWorldInteraction, type ChatMessage, type WorldInteractionKind } from "@bw/shared";

export interface ServerWorldEvent {
  targetId: string;
  actorId: string;
  actorName: string;
  kind: WorldInteractionKind;
  at: number;
}

/** Validate server chat payloads before adding them to the persistent UI store. */
export function validateServerChatMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || value.id.length > 64 ||
      typeof value.from !== "string" || !value.from.trim() || value.from.length > 32 ||
      typeof value.text !== "string" || !value.text.trim() || value.text.length > CHAT_MAX_LEN ||
      !Number.isSafeInteger(value.at) || (value.at as number) <= 0) return null;
  return { id: value.id, from: value.from, text: value.text, at: value.at as number };
}

/** World events must refer to a known interaction and match its authored kind. */
export function validateServerWorldEvent(raw: unknown): ServerWorldEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.targetId !== "string" || typeof value.actorId !== "string" ||
      !value.actorId || value.actorId.length > 128 ||
      typeof value.actorName !== "string" || !value.actorName.trim() || value.actorName.length > 32 ||
      !Number.isSafeInteger(value.at) || (value.at as number) <= 0) return null;
  const target = getWorldInteraction(value.targetId);
  if (!target || value.kind !== target.kind) return null;
  return {
    targetId: target.id,
    actorId: value.actorId,
    actorName: value.actorName,
    kind: target.kind,
    at: value.at as number,
  };
}
