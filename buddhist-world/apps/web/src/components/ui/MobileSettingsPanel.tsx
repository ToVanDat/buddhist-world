import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PROFILES, type Quality } from "../../game/rendering/quality";
import type { CameraMode } from "../../game/rendering/cameraModes";
import { useGame } from "../../stores/game";
import { useSettings } from "../../stores/settings";

type SettingsSection = "graphics" | "audio" | "camera" | "controls";
const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "graphics", label: "Đồ họa", icon: "◈" }, { id: "audio", label: "Âm thanh", icon: "♫" },
  { id: "camera", label: "Camera", icon: "◎" }, { id: "controls", label: "Điều khiển", icon: "⌘" },
];
const QUALITY_HINT: Record<Quality, string> = {
  ULTRA: "Chi tiết tối đa · phù hợp GPU mạnh", HIGH: "Cân bằng hình ảnh và độ mượt",
  MEDIUM: "Ưu tiên FPS ổn định", LOW: "Giảm hiệu ứng để tăng độ mượt", MOBILE: "Tối ưu cho thiết bị cảm ứng",
};

export function MobileSettingsPanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [section, setSection] = useState<SettingsSection>("graphics");
  const reduceMotion = useReducedMotion();
  const quality = useSettings((state) => state.quality);
  const setQuality = useSettings((state) => state.setQuality);
  const qualityMode = useSettings((state) => state.qualityMode);
  const setQualityMode = useSettings((state) => state.setQualityMode);
  const audioVolume = useSettings((state) => state.audioVolume);
  const setAudioVolume = useSettings((state) => state.setAudioVolume);
  const lookSensitivity = useSettings((state) => state.lookSensitivity);
  const setLookSensitivity = useSettings((state) => state.setLookSensitivity);
  const cameraMode = useGame((state) => state.cameraMode);
  const setCameraMode = useGame((state) => state.setCameraMode);
  const profile = PROFILES[quality];

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button, select, input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')];
      if (!items.length) return;
      const first = items[0]!, last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  return <motion.div className="bw-settings-backdrop" data-ui onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0.01 : .2 }}>
    <motion.section ref={dialogRef} className="bw-settings-panel" role="dialog" aria-modal="true" aria-labelledby="bw-settings-title"
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: .985 }} transition={{ duration: reduceMotion ? .01 : .24, ease: "easeOut" }}>
      <header className="bw-settings-heading"><div><span>TRẢI NGHIỆM CỦA BẠN</span><h2 id="bw-settings-title">Cài đặt</h2><p>Tuỳ chỉnh thế giới theo cách bạn muốn.</p></div><button type="button" className="bw-close-button" onClick={onClose} aria-label="Đóng cài đặt">×</button></header>
      <nav className="bw-settings-tabs" aria-label="Nhóm cài đặt">
        {SECTIONS.map((item) => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} aria-pressed={section === item.id} onClick={() => setSection(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
      </nav>
      <div className="bw-settings-content" key={section}>
        {section === "graphics" && <>
          <div className="bw-setting-intro"><span>HIỂN THỊ</span><strong>Chất lượng đồ họa</strong><p>Thay đổi được áp dụng ngay. Hệ thống có thể tự thích ứng khi FPS thay đổi.</p></div>
          <div className="bw-quality-preview"><div className="bw-quality-preview-top"><span>HỒ SƠ HIỆN TẠI</span><b>{quality}</b></div><strong>{QUALITY_HINT[quality]}</strong><div className="bw-quality-metrics"><span>Đổ bóng <b>{profile.shadows ? "Bật" : "Tắt"}</b></span><span>Shadow map <b>{profile.shadowMapSize}px</b></span><span>DPR <b>{profile.dpr[0]}–{profile.dpr[1]}</b></span><span>Khử răng cưa <b>{profile.antialias ? "Bật" : "Tắt"}</b></span></div></div>
          <div className="bw-setting-field"><span>Điều chỉnh chất lượng</span><div className="bw-quality-mode" role="group" aria-label="Chế độ chất lượng"><button type="button" aria-pressed={qualityMode === "auto"} onClick={() => setQualityMode("auto")}>Tự động</button><button type="button" aria-pressed={qualityMode === "manual"} onClick={() => setQualityMode("manual")}>Thủ công</button></div></div>
          <label className="bw-setting-field">Mức chất lượng<select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}>{(Object.keys(PROFILES) as Quality[]).map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select></label>
        </>}
        {section === "audio" && <><div className="bw-setting-intro"><span>KHÔNG GIAN ÂM THANH</span><strong>Âm thanh môi trường</strong><p>Điều chỉnh âm lượng ambience của khu vực.</p></div><div className="bw-volume-card"><div><strong>Âm lượng môi trường</strong><output>{Math.round(audioVolume * 100)}%</output></div><input aria-label="Âm lượng môi trường" type="range" min="0" max="1" step="0.05" value={audioVolume} onChange={(event) => setAudioVolume(Number(event.target.value))} /><div className="bw-range-labels"><span>Im lặng</span><span>Rõ nét</span></div></div></>}
        {section === "camera" && <><div className="bw-setting-intro"><span>GÓC NHÌN</span><strong>Góc nhìn tham quan</strong><p>Chế độ điện ảnh và chụp ảnh giảm bớt HUD để nhường chỗ cho cảnh 3D.</p></div><div className="bw-camera-options">{([{ id: "gameplay", title: "Tham quan", detail: "Chỉ dẫn khám phá và tương tác thiết yếu" }, { id: "cinematic", title: "Điện ảnh", detail: "Ẩn bớt HUD để ngắm kiến trúc" }, { id: "photo", title: "Chụp ảnh", detail: "Góc nhìn tĩnh, ưu tiên khung hình và kiến trúc" }] as { id: CameraMode; title: string; detail: string }[]).map((mode) => <button key={mode.id} type="button" className={cameraMode === mode.id ? "is-active" : ""} aria-pressed={cameraMode === mode.id} onClick={() => setCameraMode(mode.id)}><span><strong>{mode.title}</strong><small>{mode.detail}</small></span><i aria-hidden="true">{cameraMode === mode.id ? "✓" : ""}</i></button>)}</div></>}
        {section === "controls" && <><div className="bw-setting-intro"><span>THAO TÁC</span><strong>Điều khiển camera</strong><p>Điều chỉnh độ nhạy khi quan sát và xoay góc nhìn.</p></div><div className="bw-volume-card"><div><strong>Độ nhạy camera</strong><output>{lookSensitivity.toFixed(1)}×</output></div><input aria-label="Độ nhạy camera" type="range" min=".4" max="2" step=".1" value={lookSensitivity} onChange={(event) => setLookSensitivity(Number(event.target.value))} /><div className="bw-range-labels"><span>Chậm</span><span>Nhanh</span></div></div><div className="bw-control-reference"><strong>Di chuyển và quan sát</strong><p>WASD đi bộ · E tìm hiểu kiến trúc</p><p>Giữ và kéo vùng cảnh để xoay camera; lăn chuột để điều chỉnh khoảng cách.</p></div></>}
      </div>
      <footer className="bw-settings-footer"><span><i aria-hidden="true" /> Đã áp dụng trực tiếp</span><button className="bw-settings-done" type="button" onClick={onClose}>Hoàn tất</button></footer>
    </motion.section>
  </motion.div>;
}
