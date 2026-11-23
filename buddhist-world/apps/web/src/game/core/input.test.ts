import { afterEach, describe, expect, it } from "vitest";
import { input, isGameplayInputBlocked, resetGameplayInput, setGameplayInputBlocked } from "./input";

afterEach(() => {
  setGameplayInputBlocked(false);
  resetGameplayInput();
});

describe("gameplay input lock", () => {
  it("clears every active movement and action input when a modal takes control", () => {
    input.keyX = 1; input.keyZ = -1; input.joyX = 0.5; input.joyZ = 0.75;
    input.keySprint = true; input.touchSprint = true;
    input.jumpQueued = true; input.interactQueued = true;

    setGameplayInputBlocked(true);

    expect(isGameplayInputBlocked()).toBe(true);
    expect(input.keyX).toBe(0); expect(input.keyZ).toBe(0);
    expect(input.joyX).toBe(0); expect(input.joyZ).toBe(0);
    expect(input.keySprint).toBe(false); expect(input.touchSprint).toBe(false);
    expect(input.jumpQueued).toBe(false); expect(input.interactQueued).toBe(false);
  });

  it("allows gameplay input after the blocking surface releases focus", () => {
    setGameplayInputBlocked(true);
    setGameplayInputBlocked(false);
    expect(isGameplayInputBlocked()).toBe(false);
  });

  it("clears held movement, sprint and queued actions on page interruption", () => {
    input.keyX = 1; input.keyZ = -1; input.joyX = 0.5; input.joyZ = -0.75;
    input.keySprint = true; input.touchSprint = true;
    input.jumpQueued = true; input.interactQueued = true;

    resetGameplayInput();

    expect(input).toMatchObject({
      keyX: 0, keyZ: 0, joyX: 0, joyZ: 0,
      keySprint: false, touchSprint: false, jumpQueued: false, interactQueued: false,
    });
  });
});
