import { useEffect, useRef } from "react";
import { PROFILES, type Quality } from "../../game/rendering/quality";
import type { CameraMode } from "../../game/rendering/cameraModes";
import { useGame } from "../../stores/game";
import { useSettings } from "../../stores/settings";

export function MobileSettingsPanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const quality = useSettings((state) => state.quality);
  const setQuality = useSettings((state) => state.setQuality);
  const audioVolume = useSettings((state) => state.audioVolume);
  const setAudioVolume = useSettings((state) => state.setAudioVolume);
  const cameraMode = useGame((state) => state.cameraMode);
  const setCameraMode = useGame((state) => state.setCameraMode);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button, select, input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  return (
    <div className="bw-settings-backdrop" data-ui onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="bw-settings-panel" role="dialog" aria-modal="true" aria-labelledby="bw-settings-title">
        <header className="bw-settings-heading">
          <div><span>CẤU HÌNH TRẢI NGHIỆM</span><h2 id="bw-settings-title">Cài đặt</h2></div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Đóng cài đặt">Đóng</button>
        </header>
        <div className="bw-settings-fields">
          <label>Chất lượng đồ họa
            <select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}>
              {(Object.keys(PROFILES) as Quality[]).map((tier) => <option key={tier} value={tier}>{tier}</option>)}
            </select>
          </label>
          <label>Chế độ camera
            <select value={cameraMode} onChange={(event) => setCameraMode(event.target.value as CameraMode)}>
              <option value="gameplay">Gameplay</option><option value="cinematic">Cinematic</option><option value="photo">Photo</option>
            </select>
          </label>
          <label className="bw-settings-volume"><span>Âm lượng môi trường</span><output>{Math.round(audioVolume * 100)}%</output>
            <input aria-label="Âm lượng môi trường" type="range" min="0" max="1" step="0.05" value={audioVolume} onChange={(event) => setAudioVolume(Number(event.target.value))} />
          </label>
        </div>
        <p className="bw-settings-note">Thay đổi được áp dụng ngay trong thế giới. Chất lượng tự thích ứng có thể điều chỉnh mức đồ họa khi FPS thay đổi.</p>
        <button className="bw-settings-done" type="button" onClick={onClose}>Hoàn tất</button>
      </section>
    </div>
  );
}
