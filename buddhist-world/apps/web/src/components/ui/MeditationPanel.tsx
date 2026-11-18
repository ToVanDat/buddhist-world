import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface MeditationPanelProps { onClose: () => void }
const DURATIONS = [1, 3, 5, 10, 15];

export function MeditationPanel({ onClose }: MeditationPanelProps) {
  const [minutes, setMinutes] = useState(5);
  const [remainingMs, setRemainingMs] = useState(5 * 60_000);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (endAt === null) return;
    const tick = () => {
      const next = Math.max(0, endAt - Date.now());
      setRemainingMs(next);
      if (next === 0) { setEndAt(null); setCompleted(true); }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endAt]);

  function chooseDuration(value: number) {
    if (endAt !== null) return;
    setMinutes(value);
    setRemainingMs(value * 60_000);
    setCompleted(false);
  }
  function startOrResume() {
    if (remainingMs <= 0) setRemainingMs(minutes * 60_000);
    setCompleted(false);
    setEndAt(Date.now() + (remainingMs > 0 ? remainingMs : minutes * 60_000));
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
        <p className="bw-meditation-disclaimer">Bộ hẹn giờ chạy cục bộ trên thiết bị, không lưu phiên thiền, không cấp phần thưởng trong game.</p>
      </motion.section>
    </motion.div>
  );
}
