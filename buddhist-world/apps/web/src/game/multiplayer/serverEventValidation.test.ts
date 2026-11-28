import { describe, expect, it } from "vitest";
import { validateServerChatMessage, validateServerWorldEvent } from "./serverEventValidation";

describe("validateServerChatMessage", () => {
  const valid = { id: "message-1", from: "Người chơi", text: "Nam mô A Di Đà Phật", at: 1_800_000_000_000 };

  it("accepts a well-formed server chat message", () => {
    expect(validateServerChatMessage(valid)).toEqual(valid);
  });

  it("rejects malformed, blank, oversized and invalid-timestamp messages", () => {
    expect(validateServerChatMessage(null)).toBeNull();
    expect(validateServerChatMessage({ ...valid, from: " " })).toBeNull();
    expect(validateServerChatMessage({ ...valid, from: "x".repeat(33) })).toBeNull();
    expect(validateServerChatMessage({ ...valid, text: " " })).toBeNull();
    expect(validateServerChatMessage({ ...valid, text: "x".repeat(2_001) })).toBeNull();
    expect(validateServerChatMessage({ ...valid, at: Number.POSITIVE_INFINITY })).toBeNull();
    expect(validateServerChatMessage({ ...valid, at: -1 })).toBeNull();
  });
});

describe("validateServerWorldEvent", () => {
  const valid = {
    regionId: "temple_complex", targetId: "temple_bell", actorId: "user-1", actorName: "Người chơi",
    kind: "bell", at: 1_800_000_000_000,
  };

  it("accepts an event for a registered interaction with its authored kind", () => {
    expect(validateServerWorldEvent(valid, "temple_complex")).toEqual(valid);
  });

  it("rejects unknown targets, mismatched kinds and malformed actors", () => {
    expect(validateServerWorldEvent(null, "temple_complex")).toBeNull();
    expect(validateServerWorldEvent({ ...valid, targetId: "unknown" }, "temple_complex")).toBeNull();
    expect(validateServerWorldEvent({ ...valid, kind: "npc" }, "temple_complex")).toBeNull();
    expect(validateServerWorldEvent({ ...valid, actorName: " " }, "temple_complex")).toBeNull();
    expect(validateServerWorldEvent({ ...valid, actorId: "" }, "temple_complex")).toBeNull();
    expect(validateServerWorldEvent({ ...valid, at: Number.NaN }, "temple_complex")).toBeNull();
    expect(validateServerWorldEvent({ ...valid, regionId: "another-region" }, "temple_complex")).toBeNull();
    expect(validateServerWorldEvent(valid, null)).toBeNull();
  });
});
