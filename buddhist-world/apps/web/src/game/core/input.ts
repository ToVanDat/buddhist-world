/**
 * Trạng thái input mutable – tránh React re-render trong vòng lặp game.
 */
export const input = {
  keyX: 0, keyZ: 0, joyX: 0, joyZ: 0,
  keySprint: false, touchSprint: false, jumpQueued: false, interactQueued: false,
  yaw: 0, pitch: 0.35, distance: 7,
};

const keys = new Set<string>();
// Each UI layer owns its own lock so one component cannot unlock another layer.
const gameplayInputBlockers = new Set<string>();

/** Clear transient movement/actions when the page loses focus or is backgrounded. */
export function resetGameplayInput() {
  keys.clear();
  input.keyX = 0;
  input.keyZ = 0;
  input.joyX = 0;
  input.joyZ = 0;
  input.keySprint = false;
  input.touchSprint = false;
  input.jumpQueued = false;
  input.interactQueued = false;
}

/** Blocks gameplay controls while a named UI layer owns focus. */
export function setGameplayInputBlocked(blocked: boolean, owner = "legacy") {
  const wasBlocked = gameplayInputBlockers.size > 0;
  if (blocked) gameplayInputBlockers.add(owner);
  else gameplayInputBlockers.delete(owner);
  const isBlocked = gameplayInputBlockers.size > 0;
  if (isBlocked) resetGameplayInput();
  recompute();
  if (!wasBlocked && isBlocked && typeof window !== "undefined") {
    window.dispatchEvent(new Event("gameplayinputblocked"));
  }
}

export function isGameplayInputBlocked() { return gameplayInputBlockers.size > 0; }
const typing = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  return !!target && (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
};
function recompute() {
  input.keyZ = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  input.keyX = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  input.keySprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
}
export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (typing(e) || isGameplayInputBlocked()) return;
    if (e.code === "Space" && !e.repeat) { input.jumpQueued = true; e.preventDefault(); }
    if (e.code === "KeyE" && !e.repeat) { input.interactQueued = true; e.preventDefault(); }
    keys.add(e.code); recompute();
  };
  const up = (e: KeyboardEvent) => { keys.delete(e.code); recompute(); };
  const clearTransientInput = () => {
    resetGameplayInput();
    recompute();
  };
  const visibilityChange = () => {
    if (document.visibilityState !== "visible") clearTransientInput();
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clearTransientInput);
  window.addEventListener("pagehide", clearTransientInput);
  document.addEventListener("visibilitychange", visibilityChange);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clearTransientInput);
    window.removeEventListener("pagehide", clearTransientInput);
    document.removeEventListener("visibilitychange", visibilityChange);
    clearTransientInput();
  };
}

/** Kéo chuột / chạm để xoay camera; lăn chuột để zoom. */
export function bindOrbit(el: HTMLElement, getSensitivity: () => number) {
  let id: number | null = null; let lx = 0; let ly = 0;
  const down = (e: PointerEvent) => {
    if (isGameplayInputBlocked() || (e.target as HTMLElement).closest("[data-ui]")) return;
    id = e.pointerId; lx = e.clientX; ly = e.clientY; el.setPointerCapture(id);
  };
  const move = (e: PointerEvent) => {
    if (isGameplayInputBlocked() || e.pointerId !== id) return;
    const s = 0.005 * getSensitivity();
    input.yaw -= (e.clientX - lx) * s;
    input.pitch = Math.min(1.2, Math.max(-0.1, input.pitch + (e.clientY - ly) * s));
    lx = e.clientX; ly = e.clientY;
  };
  const end = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
  // A modal can open while the pointer is captured. Cancel the active orbit
  // gesture immediately so pointer movement cannot keep rotating the camera.
  const cancelOrbit = () => { id = null; };
  const wheel = (e: WheelEvent) => { if (isGameplayInputBlocked()) return; input.distance = Math.min(14, Math.max(3, input.distance + e.deltaY * 0.005)); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  window.addEventListener("gameplayinputblocked", cancelOrbit);
  el.addEventListener("wheel", wheel, { passive: true });
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    window.removeEventListener("gameplayinputblocked", cancelOrbit);
    el.removeEventListener("wheel", wheel);
  };
}
