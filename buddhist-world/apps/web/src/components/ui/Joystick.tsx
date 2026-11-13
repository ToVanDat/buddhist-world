import { useRef } from "react";
import { input, isGameplayInputBlocked } from "../../game/core/input";

/** Joystick ảo + nút nhảy/chạy cho thiết bị cảm ứng. Ghi thẳng vào `input` (không re-render). */
export function TouchControls() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const R = 48;

  const set = (e: React.PointerEvent) => {
    if (isGameplayInputBlocked()) return;
    const r = base.current!.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(x, y); if (m > R) { x = (x / m) * R; y = (y / m) * R; }
    input.joyX = x / R; input.joyZ = -y / R;
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const reset = () => {
    pid.current = null; input.joyX = 0; input.joyZ = 0;
    if (knob.current) knob.current.style.transform = "translate(0,0)";
  };

  return (
    <div data-ui className="touch">
      <div ref={base} className="joy" role="presentation"
        onPointerDown={(e) => { if (isGameplayInputBlocked()) return; pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
        onPointerMove={(e) => { if (e.pointerId === pid.current) set(e); }}
        onPointerUp={reset} onPointerCancel={reset}>
        <div ref={knob} className="joy-knob" />
      </div>
      <div className="touch-btns">
        <button className="tbtn" aria-label="Chạy"
          onPointerDown={() => { if (!isGameplayInputBlocked()) input.touchSprint = true; }}
          onPointerUp={() => { input.touchSprint = false; }}
          onPointerCancel={() => { input.touchSprint = false; }}
          onLostPointerCapture={() => { input.touchSprint = false; }}>Chạy</button>
        <button className="tbtn" aria-label="Nhảy"
          onPointerDown={() => { if (!isGameplayInputBlocked()) input.jumpQueued = true; }}>Nhảy</button>
      </div>
    </div>
  );
}
