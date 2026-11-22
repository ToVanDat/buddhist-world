import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface PrayerPanelProps { onClose: () => void }
interface PrayerProgress { version: 1; count: number; target: number; sessions: number; lastSessionAt: string | null }
const STORAGE_KEY = "bw.prayer.progress.v1";
const TARGETS = [27, 54, 108, 216];

function readProgress(): PrayerProgress {
  const fallback: PrayerProgress = { version: 1, count: 0, target: 108, sessions: 0, lastSessionAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<PrayerProgress>;
    if (value.version !== 1 || !Number.isSafeInteger(value.count) || Number(value.count) < 0 ||
        !TARGETS.includes(Number(value.target)) || !Number.isSafeInteger(value.sessions) || Number(value.sessions) < 0) return fallback;
    return { version: 1, count: Number(value.count), target: Number(value.target), sessions: Number(value.sessions),
      lastSessionAt: typeof value.lastSessionAt === "string" ? value.lastSessionAt : null };
  } catch { return fallback; }
}

export function PrayerPanel({ onClose }: PrayerPanelProps) {
  const [initial] = useState(readProgress);
  const [count, setCount] = useState(initial.count);
  const [target, setTarget] = useState(initial.target);
  const [sessions, setSessions] = useState(initial.sessions);
  const [lastSessionAt, setLastSessionAt] = useState(initial.lastSessionAt);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = (import.meta.env.VITE_PRAYER_AUDIO_URL as string | undefined)?.trim() ?? "";
  const audioTitle = (import.meta.env.VITE_PRAYER_AUDIO_TITLE as string | undefined)?.trim() || "Bản ghi niệm Phật";

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, count, target, sessions, lastSessionAt })); }
    catch { /* Progress remains available for this visit when storage is unavailable. */ }
  }, [count, target, sessions, lastSessionAt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => { setPlaying(true); setAudioError(""); };
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onError = () => { setPlaying(false); setAudioError("Không thể tải bản ghi. Hãy kiểm tra URL, định dạng và quyền truy cập tệp âm thanh."); };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [audioUrl]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); setAudioError(""); }
    catch { setAudioError("Trình duyệt chưa cho phép phát bản ghi. Hãy thử nhấn phát lại."); }
  }

  function increment() {
    if (count >= target) return;
    const next = count + 1;
    setCount(next);
    if (next === target) {
      setSessions((value) => value + 1);
      setLastSessionAt(new Date().toISOString());
    }
  }

  function resetSession() { setCount(0); }
  const progress = Math.min(100, Math.round((count / target) * 100));

  return (
    <motion.div className="bw-feature-backdrop" data-ui role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="bw-feature-panel bw-meditation-panel" role="dialog" aria-modal="true"
        aria-labelledby="bw-prayer-title" initial={{ opacity: 0, y: 16, scale: .985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>
        <header className="bw-feature-heading">
          <div><span>CHÍNH ĐIỆN · THỰC HÀNH CÁ NHÂN</span><h2 id="bw-prayer-title">Niệm Phật</h2>
            <p>Dành một khoảng lặng để chuyên tâm theo từng câu niệm.</p></div>
          <button type="button" className="bw-feature-close" onClick={onClose} aria-label="Đóng niệm Phật">×</button>
        </header>

        <section aria-label="Trình phát bản ghi niệm Phật" style={{ padding: "18px 0", borderBottom: "1px solid rgba(190,160,110,.2)" }}>
          <span style={{ display: "block", fontSize: 11, letterSpacing: ".16em", opacity: .7, marginBottom: 8 }}>BẢN GHI ÂM THANH</span>
          <strong>{audioTitle}</strong>
          {audioUrl ? <>
            <audio ref={audioRef} src={audioUrl} preload="metadata" loop />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
              <button type="button" className="bw-feature-action" onClick={() => void togglePlayback()}>{playing ? "TẠM DỪNG" : "PHÁT BẢN NIỆM"}</button>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" defaultChecked onChange={(event) => { if (audioRef.current) audioRef.current.loop = event.currentTarget.checked; }} /> Lặp lại
              </label>
            </div>
            {audioError && <p role="alert" style={{ color: "#d98c78", fontSize: 12 }}>{audioError}</p>}
          </> : <p role="status" style={{ fontSize: 13, opacity: .72, lineHeight: 1.6 }}>
            Chưa cấu hình bản ghi âm. Đặt VITE_PRAYER_AUDIO_URL trong môi trường web bằng đường dẫn tới tệp âm thanh có quyền sử dụng. Trình phát sẽ được kích hoạt khi có bản ghi thật.
          </p>}
        </section>

        <section style={{ padding: "20px 0" }} aria-label="Bộ đếm câu niệm">
          <span style={{ display: "block", textAlign: "center", fontSize: 11, letterSpacing: ".16em", opacity: .7 }}>TRÀNG HẠT · SỐ CÂU ĐÃ NIỆM</span>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <strong aria-live="polite" aria-atomic="true" style={{ display: "block", fontSize: "clamp(48px, 12vw, 76px)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{count}</strong>
            <span style={{ opacity: .65, fontSize: 13 }}> / {target} câu</span>
          </div>
          <div role="progressbar" aria-label="Tiến độ niệm Phật" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(count, target)}
            style={{ height: 5, borderRadius: 99, background: "rgba(190,160,110,.2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", background: "linear-gradient(90deg,#a77b45,#e6c98e)", transition: "width .2s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            {TARGETS.map((value) => <button key={value} type="button" className="bw-feature-secondary" aria-pressed={target === value}
              onClick={() => { setTarget(value); setCount(0); }}>{value}</button>)}
          </div>
          <button type="button" className="bw-feature-action" onClick={increment} disabled={count >= target}
            style={{ width: "100%", minHeight: 54, fontSize: 15 }}>{count >= target ? "ĐÃ HOÀN THÀNH THỜI KHÓA" : "NAM MÔ A DI ĐÀ PHẬT · +1"}</button>
          <div className="bw-meditation-actions" style={{ justifyContent: "center" }}>
            <button type="button" className="bw-feature-secondary" onClick={resetSession}>BẮT ĐẦU LẠI</button>
          </div>
        </section>
        <p className="bw-meditation-history" aria-live="polite">Đã hoàn thành {sessions} thời khóa trên thiết bị này{lastSessionAt ? " · Gần nhất " + new Date(lastSessionAt).toLocaleString("vi-VN") : ""}.</p>
        <p className="bw-meditation-disclaimer">Bộ đếm do người dùng chủ động ghi nhận, không tự xác nhận việc niệm. Tiến trình hiện lưu trên thiết bị này, chưa đồng bộ tài khoản.</p>
      </motion.section>
    </motion.div>
  );
}
