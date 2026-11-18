import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface MeditationPanelProps { onClose: () => void }
interface MeditationSnapshot {
  version: 1;
  minutes: number;
  remainingMs: number;
  endAt: number | null;
  completed: boolean;
  completedSessions: number;
  lastCompletedAt: string | null;
}
const DURATIONS = [1, 3, 5, 10, 15];
const STORAGE_KEY = "bw.meditation.local.v1";

function readSnapshot(): MeditationSnapshot {
  const fallback: MeditationSnapshot = {
    version: 1, minutes: 5, remainingMs: 5 * 60_000, endAt: null,
    completed: false, completedSessions: 0, lastCompletedAt: null,
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<MeditationSnapshot>;
    if (value.version !== 1 || !DURATIONS.includes(Number(value.minutes)) ||
        !Number.isFinite(value.remainingMs) || Number(value.remainingMs) < 0 ||
        !(value.endAt === null || (typeof value.endAt === "number" && Number.isFinite(value.endAt))) ||
        !Number.isSafeInteger(value.completedSessions) || Number(value.completedSessions) < 0 ||
        typeof value.completed !== "boolean") return fallback;
    return {
      version: 1,
      minutes: Number(value.minutes),
      remainingMs: Math.min(Number(value.remainingMs), Number(value.minutes) * 60_000),
      endAt: value.endAt ?? null,
      completed: value.completed,
      completedSessions: Number(value.completedSessions),
      lastCompletedAt: typeof value.lastCompletedAt === "string" ? value.lastCompletedAt : null,
    };
  } catch {
    return fallback;
  }
}

export function MeditationPanel({ onClose }: MeditationPanelProps) {
  const [initial] = useState(readSnapshot);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [remainingMs, setRemainingMs] = useState(initial.remainingMs);
  const [endAt, setEndAt] = useState<number | null>(initial.endAt);
  const [completed, setCompleted] = useState(initial.completed);
  const [completedSessions, setCompletedSessions] = useState(initial.completedSessions);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(initial.lastCompletedAt);

  useEffect(() => {
    if (endAt === null) return;
    let finished = false;
    const tick = () => {
      const next = Math.max(0, endAt - Date.now());
      setRemainingMs(next);
      if (next === 0 && !finished) {
        finished = true;
        window.clearInterval(timer);
        setEndAt(null);
        setCompleted(true);
        setCompletedSessions((count) => count + 1);
        setLastCompletedAt(new Date().toISOString());
      }
    };
    const timer = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(timer);
  }, [endAt]);

  useEffect(() => {
    const snapshot: MeditationSnapshot = {
      version: 1, minutes, remainingMs, endAt, completed,
      completedSessions, lastCompletedAt,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Private browsing / storage quota: the timer remains usable for this visit.
    }
  }, [minutes, remainingMs, endAt, completed, completedSessions, lastCompletedAt]);

  function chooseDuration(value: number) {
    if (endAt !== null) return;
    setMinutes(value);
    setRemainingMs(value * 60_000);
    setCompleted(false);
  }
  function startOrResume() {
    const duration = remainingMs > 0 ? remainingMs : minutes * 60_000;
    setRemainingMs(duration);
    setCompleted(false);
    setEndAt(Date.now() + duration);
  }
  function pause() {
    if (endAt !== null) setRemainingMs(Math.max(0, endAt - Date.now()));
    setEndAt(null);
  }
  function reset() {
    setEndAt(null);
    setRemainingMs(minutes * 60_000);
    setCompleted(false);
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const timeLabel = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  const running = endAt !== null;

  return (
    <motion.div className="bw-feature-backdrop" data-ui role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="bw-feature-panel bw-meditation-panel" role="dialog" aria-modal="true" aria-labelledby="bw-meditation-title"
        initial={{ opacity: 0, y: 16, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>
        <header className="bw-feature-heading">
          <div><span>KHOẢNG LẶNG · THỰC HÀNH CÁ NHÂN</span><h2 id="bw-meditation-title">Trở về với hơi thở</h2><p>Không cần vội vàng. Hãy dành một chút thời gian cho hiện tại.</p></div>
          <button type="button" className="bw-feature-close" onClick={onClose} aria-label="Đóng thiền định">×</button>
        </header>
        <div className={`bw-breath-stage${running ? " is-running" : ""}`} aria-hidden="true"><div className="bw-breath-orbit"><span /><i>AN</i></div></div>
        <p className="bw-meditation-guidance" aria-live="polite">{completed ? "Buổi thực hành đã hoàn tất. Cảm ơn bạn đã dành thời gian cho chính mình." : running ? "Hít vào nhẹ nhàng… thở ra chậm rãi…" : "Ngồi thoải mái, thả lỏng vai và quan sát hơi thở tự nhiên."}</p>
        <div className="bw-meditation-clock" role="timer" aria-label={`Thời gian còn lại ${timeLabel}`}>{timeLabel}</div>
        <div className="bw-meditation-durations" aria-label="Chọn thời lượng">
          {DURATIONS.map((duration) => <button key={duration} type="button" disabled={running} aria-pressed={minutes === duration} onClick={() => chooseDuration(duration)}>{duration} phút</button>)}
        </div>
        <div className="bw-meditation-actions">
          {running ? <button type="button" className="bw-feature-action" onClick={pause}>TẠM DỪNG</button> : <button type="button" className="bw-feature-action" onClick={startOrResume}>{completed ? "THỰC HÀNH LẠI" : remainingMs < minutes * 60_000 ? "TIẾP TỤC" : "BẮT ĐẦU"}</button>}
          <button type="button" className="bw-feature-secondary" onClick={reset}>ĐẶT LẠI</button>
        </div>
        <p className="bw-meditation-history" aria-live="polite">Đã hoàn tất {completedSessions} buổi trên thiết bị này{lastCompletedAt ? ` · Gần nhất ${new Date(lastCompletedAt).toLocaleString("vi-VN")}` : ""}.</p>
        <p className="bw-meditation-disclaimer">Tiến độ được lưu cục bộ trên trình duyệt này và không đồng bộ giữa các thiết bị. Chưa tích hợp phần thưởng trong game.</p>
      </motion.section>
    </motion.div>
  );
}
