import { describe, expect, it } from "vitest";
import { MAX_VOICE_PEERS, VOICE_RADIUS_M } from "@bw/shared";
import { selectNearbyVoicePlayers } from "./proximity.js";

describe("world voice proximity policy", () => {
  it("excludes the listener and players outside the same proximity radius", () => {
    const listener = { userId: "listener", pos: [0, 0, 0] as [number, number, number] };
    const selected = selectNearbyVoicePlayers(listener, [
      listener,
      { userId: "near", pos: [3, 0, 4] as [number, number, number] },
      { userId: "edge", pos: [VOICE_RADIUS_M, 0, 0] as [number, number, number] },
      { userId: "far", pos: [VOICE_RADIUS_M + 0.1, 0, 0] as [number, number, number] },
    ]);
    expect(selected.map((player) => player.userId)).toEqual(["near", "edge"]);
  });

  it("orders nearest speakers first and caps the listener fan-out", () => {
    const listener = { userId: "listener", pos: [0, 0, 0] as [number, number, number] };
    const candidates = Array.from({ length: MAX_VOICE_PEERS + 3 }, (_, index) => ({
      userId: `player-${index}`,
      pos: [index + 1, 0, 0] as [number, number, number],
    }));
    const selected = selectNearbyVoicePlayers(listener, candidates);
    expect(selected).toHaveLength(MAX_VOICE_PEERS);
    expect(selected[0]?.userId).toBe("player-0");
    expect(selected.at(-1)?.userId).toBe(`player-${MAX_VOICE_PEERS - 1}`);
  });
});
