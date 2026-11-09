/**
 * Trạng thái input có thể thay đổi trực tiếp (mutable) – KHÔNG đặt trong React state
 * để vòng lặp render không bị re-render mỗi frame.
 */
export const input = {
  keyX: 0, keyZ: 0, joyX: 0, joyZ: 0,
  keySprint: false, touchSprint: false, jumpQueued: false,
  yaw: 0, pitch: 0.35, distance: 7,
};

const keys = new Set<string>();
const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
};
function recompute() {
  input.keyZ = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  input.keyX = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  input.keySprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
}
export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    if (e.code === "Space" && !e.repeat) { input.jumpQueued = true; e.preventDefault(); }
    keys.add(e.code); recompute();
  };
  const up = (e: KeyboardEvent) => { keys.delete(e.code); recompute(); };
  const blur = () => { keys.clear(); recompute(); };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
  };
}

/** Kéo chuột / chạm để xoay camera; lăn chuột để zoom. */
export function bindOrbit(el: HTMLElement, getSensitivity: () => number) {
  let id: number | null = null; let lx = 0; let ly = 0;
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    id = e.pointerId; lx = e.clientX; ly = e.clientY; el.setPointerCapture(id);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const s = 0.005 * getSensitivity();
    input.yaw -= (e.clientX - lx) * s;
    input.pitch = Math.min(1.2, Math.max(-0.1, input.pitch + (e.clientY - ly) * s));
    lx = e.clientX; ly = e.clientY;
  };
  const end = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
  const wheel = (e: WheelEvent) => { input.distance = Math.min(14, Math.max(3, input.distance + e.deltaY * 0.005)); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", wheel, { passive: true });
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    el.removeEventListener("wheel", wheel);
  };
}
