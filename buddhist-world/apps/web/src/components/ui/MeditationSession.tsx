import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../../stores/game";

interface MeditationRecord {
  startedAt: number;
  completedAt: number;
  durationSeconds: number;
}
const STORAGE_KEY = "bw.meditation.sessions.v1";
const DURATIONS = [5, 10, 15, 20] as const;

function readRecords(): MeditationRecord[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is MeditationRecord =>
      !!item && Number.isFinite(item.startedAt) && Number.isFinite(item.completedAt) &&
      Number.isFinite(item.durationSeconds) && item.durationSeconds > 0);
  } catch { return []; }
}

export function MeditationSession() {
  const startedAt = useGame((state) => state.playerActionStartedAt);
  const finishPlayerAction = useGame((state) => state.finishPlayerAction);
  const [durationMinutes, setDurationMinutes] = useState<number>(5);
  const [now, setNow] = useState(() => Date.now());
  const [completed, setCompleted] = useState(false);
  const savedRef = useRef(false);
  const totalMinutes = useMemo(() => readRecords().reduce((sum, record) => sum + record.durationSeconds / 60, 0), [completed]);
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const targetSeconds = durationMinutes * 60;
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  const progress = Math.min(100, (elapsedSeconds / targetSeconds) * 100);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (completed || savedRef.current || remainingSeconds > 0 || !startedAt) return;
    savedRef.current = true;
    const record: MeditationRecord = { startedAt, completedAt: Date.now(), durationSeconds: targetSeconds };
    try {
      const records = readRecords();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, record].slice(-200)));
    } catch { /* Private browsing or storage quota: keep the session usable. */ }
    setCompleted(true);
    const finishTimer = window.setTimeout(finishPlayerAction, 2500);
    return () => window.clearTimeout(finishTimer);
  }, [completed, remainingSeconds, startedAt, targetSeconds, finishPlayerAction]);

  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section className="bw-meditation-session" data-ui aria-live="polite" aria-label="Phiên thiền định">
      <div className="bw-meditation-heading">
        <span className="bw-meditation-symbol" aria-hidden="true">☸</span>
        <div><span className="bw-meditation-eyebrow">KHÔNG GIAN TĨNH TÂM</span><strong>{completed ? "Hoàn thành phiên thiền" : "An trú trong hiện tại"}</strong></div>
        {!completed && <button type="button" className="bw-meditation-exit" onClick={finishPlayerAction}>Đứng dậy</button>}
      </div>
      {!completed ? <>
        <div className="bw-meditation-clock" role="timer" aria-label={`Còn lại ${formatTime(remainingSeconds)}`}>{formatTime(remainingSeconds)}</div>
        <div className="bw-meditation-progress" role="progressbar" aria-label="Tiến trình phiên thiền" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div>
        <div className="bw-meditation-duration" aria-label="Thời lượng phiên thiền">
          {DURATIONS.map((minutes) => <button key={minutes} type="button" aria-pressed={durationMinutes === minutes} onClick={() => setDurationMinutes(minutes)}>{minutes} phút</button>)}
        </div>
        <p>Hít vào nhẹ nhàng, thở ra chậm rãi. Bạn có thể đứng dậy bất cứ lúc nào.</p>
      </> : <div className="bw-meditation-complete"><strong>{durationMinutes} phút tĩnh tâm</strong><span>Tiến trình đã được lưu trên thiết bị này.</span></div>}
      <div className="bw-meditation-total"><span>TỔNG THỜI GIAN ĐÃ HOÀN THÀNH TRÊN THIẾT BỊ</span><strong>{Math.floor(totalMinutes)} phút</strong></div>
    </section>
  );
}
