import { describe, expect, it } from "vitest";
import { InteractionResponseFence } from "./InteractionResponseFence";

describe("InteractionResponseFence", () => {
  it("rejects a delayed response from NPC A after requesting NPC B", () => {
    const fence = new InteractionResponseFence();
    fence.begin("request-a", "npc-a");
    fence.begin("request-b", "npc-b");

    expect(fence.consume("request-a", "npc-a")).toBe(false);
    expect(fence.consume("request-b", "npc-b")).toBe(true);
  });

  it("accepts only the matching response and rejects duplicates", () => {
    const fence = new InteractionResponseFence();
    fence.begin("request-b", "npc-b");

    expect(fence.consume("request-b", "npc-a")).toBe(false);
    expect(fence.consume("request-b", "npc-b")).toBe(true);
    expect(fence.consume("request-b", "npc-b")).toBe(false);
  });

  it("allows a new request to the same NPC", () => {
    const fence = new InteractionResponseFence();
    fence.begin("first", "npc-a");
    expect(fence.consume("first", "npc-a")).toBe(true);

    fence.begin("second", "npc-a");
    expect(fence.consume("second", "npc-a")).toBe(true);
  });

  it("clears pending work when the world context changes", () => {
    const fence = new InteractionResponseFence();
    fence.begin("request-a", "npc-a");
    fence.clear();

    expect(fence.consume("request-a", "npc-a")).toBe(false);
  });
});
