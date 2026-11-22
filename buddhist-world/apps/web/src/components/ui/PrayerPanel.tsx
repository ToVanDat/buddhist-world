import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  DEFAULT_PRAYER_PROGRESS,
  incrementPrayerProgress,
  parsePrayerProgress,
  prayerProgressStorageKey,
  PRAYER_TARGETS,
  resetPrayerProgress,
  selectPrayerTarget,
  type PrayerProgress,
} from "./prayerProgress";

interface PrayerPanelProps { onClose: () => void; userId: string }

function readProgress(storageKey: string): PrayerProgress {
  try { return parsePrayerProgress(window.localStorage.getItem(storageKey)); }
  catch { return { ...DEFAULT_PRAYER_PROGRESS }; }
}

export function PrayerPanel({ onClose, userId }: PrayerPanelProps) {
  const storageKey = prayerProgressStorageKey(userId);
  const [initial] = useState(() => readProgress(storageKey));
  const [progress, setProgress] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const audioUrl = (import.meta.env.VITE_PRAYER_AUDIO_URL as string | undefined)?.trim() ?? "";
  const audioTitle = (import.meta.env.VITE_PRAYER_AUDIO_TITLE as string | undefined)?.trim() || "Bản ghi niệm Phật";

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(progress)); }
    catch { /* Progress remains available for this visit when storage is unavailable. */ }
  }, [progress, storageKey]);

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

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>(".bw-feature-close")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); setAudioError(""); }
    catch { setAudioError("Trình duyệt chưa cho phép phát bản ghi. Hãy thử nhấn phát lại."); }
  }

  function increment() {
    setProgress((current) => incrementPrayerProgress(current, new Date().toISOString()));
  }

  const { count, target, sessions, lastSessionAt } = progress;
  const percentage = Math.round((count / target) * 100);

  return (
    <motion.div className="bw-feature-backdrop" data-ui role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section ref={dialogRef} className="bw-feature-panel bw-meditation-panel" role="dialog" aria-modal="true"
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
          <div role="progressbar" aria-label="Tiến độ niệm Phật" aria-valuemin={0} aria-valuemax={target} aria-valuenow={count}
            style={{ height: 5, borderRadius: 99, background: "rgba(190,160,110,.2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: percentage + "%", background: "linear-gradient(90deg,#a77b45,#e6c98e)", transition: "width .2s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            {PRAYER_TARGETS.map((value) => <button key={value} type="button" className="bw-feature-secondary" aria-pressed={target === value}
              onClick={() => setProgress((current) => selectPrayerTarget(current, value))}>{value}</button>)}
          </div>
          <button type="button" className="bw-feature-action" onClick={increment} disabled={count >= target}
            style={{ width: "100%", minHeight: 54, fontSize: 15 }}>{count >= target ? "ĐÃ HOÀN THÀNH THỜI KHÓA" : "NAM MÔ A DI ĐÀ PHẬT · +1"}</button>
          <div className="bw-meditation-actions" style={{ justifyContent: "center" }}>
            <button type="button" className="bw-feature-secondary" onClick={() => setProgress(resetPrayerProgress)}>BẮT ĐẦU LẠI</button>
          </div>
        </section>
        <p className="bw-meditation-history" aria-live="polite">Đã hoàn thành {sessions} thời khóa trên thiết bị này{lastSessionAt ? " · Gần nhất " + new Date(lastSessionAt).toLocaleString("vi-VN") : ""}.</p>
        <p className="bw-meditation-disclaimer">Bộ đếm do người dùng chủ động ghi nhận, không tự xác nhận việc niệm. Tiến trình lưu cục bộ theo tài khoản trên thiết bị này, chưa đồng bộ lên máy chủ hoặc giữa các thiết bị.</p>
      </motion.section>
    </motion.div>
  );
}
