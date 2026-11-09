import { useState } from "react";
import { REGIONS } from "@bw/shared";
import { useNet } from "../../stores/net";
import { useAuth } from "../../stores/auth";
import { useSettings } from "../../stores/settings";
import { useGame } from "../../stores/game";
import { usePerformance } from "../../stores/performance";
import { PROFILES, isTouchDevice, type Quality } from "../../game/rendering/quality";
import { disconnect } from "../../game/multiplayer/socket";
import { activateCheckpoint } from "../../game/interactions/checkpoints";
import { ChatPanel } from "./ChatPanel";
import { TouchControls } from "./Joystick";
import { ProfilePanel } from "./ProfilePanel";
import { TempleGuide } from "./TempleGuide";

const STATUS: Record<string, string> = {
  idle: "Chưa kết nối", connecting: "Đang kết nối…", "in-region": "Đã vào thế giới",
  reconnecting: "Mất kết nối, đang thử lại…", error: "Lỗi kết nối",
};

export function HUD() {
  const { status, regionId, notice, remoteIds } = useNet();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { quality, setQuality } = useSettings();
  const { nearbyCheckpoint, checkpointMessage, checkpointBusy } = useGame();
  const touch = isTouchDevice();
  const [profileOpen, setProfileOpen] = useState(false);
  const perfVisible = usePerformance((s) => s.visible);
  const perf = usePerformance((s) => s.snapshot);
  const togglePerf = usePerformance((s) => s.toggle);

  return (
    <>
      <header data-ui className="hud-top">
        <div>
          <strong className="region">{regionId ? REGIONS[regionId]?.name : "Cõi Chùa"}</strong>
          <span className="muted">{STATUS[status]} · {remoteIds.length} người ở gần</span>
        </div>
        <div className="hud-actions">
          <label className="muted">Đồ họa{" "}
            <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
              {(Object.keys(PROFILES) as Quality[]).map((q) => <option key={q}>{q}</option>)}
            </select>
          </label>
          {import.meta.env.DEV && <button className="ghost" aria-pressed={perfVisible} onClick={togglePerf}>FPS</button>}
          <button className="profile-trigger" onClick={() => setProfileOpen(true)} aria-haspopup="dialog" aria-label="Mở hồ sơ người chơi"><span className="profile-trigger-avatar">{(user?.displayName ?? user?.username ?? "P").slice(0, 1).toUpperCase()}</span><span>{user?.displayName ?? user?.username}</span></button>
          <button className="ghost" onClick={async () => { disconnect(); await logout(); }}>Thoát</button>
        </div>
      </header>
      <TempleGuide />
      {import.meta.env.DEV && perfVisible && (
        <aside data-ui className="performance-panel" aria-label="Thông số hiệu năng">
          <strong>Performance · DEV</strong>
          <div><span>FPS</span><b>{perf.fps}</b></div>
          <div><span>Frame time</span><b>{perf.frameMs.toFixed(1)} ms</b></div>
          <div><span>Draw calls</span><b>{perf.drawCalls}</b></div>
          <div><span>Triangles</span><b>{perf.triangles.toLocaleString()}</b></div>
          <div><span>Geometries / Textures</span><b>{perf.geometries} / {perf.textures}</b></div>
        </aside>
      )}
      {notice && <div data-ui className="toast" role="status">{notice}</div>}
      {nearbyCheckpoint && (
        <section data-ui className="checkpoint-panel" aria-live="polite">
          <strong>{nearbyCheckpoint.name}</strong>
          <span>{nearbyCheckpoint.description}</span>
          <button disabled={checkpointBusy} onClick={() => void activateCheckpoint(nearbyCheckpoint.id)}>
            {checkpointBusy ? "Đang lưu…" : touch ? "Lưu điểm dừng" : "E · Lưu điểm dừng"}
          </button>
        </section>
      )}
      {checkpointMessage && <div data-ui className="checkpoint-status" role="status">{checkpointMessage}</div>}
      {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
      <ChatPanel />
      {touch ? <TouchControls /> : <p data-ui className="hint muted">WASD di chuyển · Shift chạy · Space nhảy · E tương tác · kéo chuột xoay · lăn chuột zoom</p>}
    </>
  );
}
