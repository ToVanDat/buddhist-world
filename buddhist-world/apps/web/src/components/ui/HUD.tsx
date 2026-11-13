import { useEffect, useState } from "react";
import { REGIONS } from "@bw/shared";
import { useNet } from "../../stores/net";
import { useAuth } from "../../stores/auth";
import { useSettings } from "../../stores/settings";
import { useGame } from "../../stores/game";
import { usePerformance } from "../../stores/performance";
import { PROFILES, isTouchDevice, type Quality } from "../../game/rendering/quality";
import { disconnect, sendWorldInteraction } from "../../game/multiplayer/socket";
import { activateCheckpoint } from "../../game/interactions/checkpoints";
import { setGameplayInputBlocked } from "../../game/core/input";
import { ChatPanel } from "./ChatPanel";
import { VoiceChat } from "./VoiceChat";
import { TouchControls } from "./Joystick";
import { ProfilePanel } from "./ProfilePanel";
import { TempleGuide } from "./TempleGuide";
import { WorldJournal } from "./WorldJournal";
import { NpcDialogue } from "./NpcDialogue";
const STATUS: Record<string, string> = { idle: "Chưa kết nối", connecting: "Đang kết nối…", "in-region": "Đã vào thế giới", reconnecting: "Mất kết nối, đang thử lại…", error: "Lỗi kết nối" };

export function HUD() {
  const { status, regionId, notice, remoteIds } = useNet();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { quality, setQuality } = useSettings();
  const { nearbyCheckpoint, checkpointMessage, checkpointBusy, nearbyInteraction, interactionMessage, npcDialogue, cameraMode, setCameraMode } = useGame();
  const touch = isTouchDevice();
  const [profileOpen, setProfileOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const perfVisible = usePerformance((s) => s.visible);
  const perf = usePerformance((s) => s.snapshot);
  const togglePerf = usePerformance((s) => s.toggle);
  useEffect(() => {
    document.documentElement.dataset.cameraMode = cameraMode;
    return () => { delete document.documentElement.dataset.cameraMode; };
  }, [cameraMode]);
  useEffect(() => {\n    const blocked = profileOpen || journalOpen || Boolean(npcDialogue);\n    setGameplayInputBlocked(blocked);\n    return () => setGameplayInputBlocked(false);\n  }, [profileOpen, journalOpen, npcDialogue]);
  return <>
    <header data-ui className="hud-top bw-hud-top">
      <div className="bw-hud-location" aria-label="Thông tin khu vực"><span className="bw-hud-eyebrow">BUDDHIST WORLD</span><strong className="region">{regionId ? REGIONS[regionId]?.name : "Cõi Chùa"}</strong><span className="bw-hud-presence"><i className={`bw-status-dot is-${status}`} aria-hidden="true" />{STATUS[status]} · {remoteIds.length} người ở gần</span></div>
      <div className="hud-actions bw-hud-actions">
        <label className="muted">Đồ họa{" "}<select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>{(Object.keys(PROFILES) as Quality[]).map((q) => <option key={q}>{q}</option>)}</select></label>
        <label className="muted">Camera{" "}<select aria-label="Chế độ camera" value={cameraMode} onChange={(e) => setCameraMode(e.target.value as typeof cameraMode)}><option value="gameplay">Gameplay</option><option value="cinematic">Cinematic</option><option value="photo">Photo</option></select></label>
        {import.meta.env.DEV && <button className="ghost" aria-pressed={perfVisible} onClick={togglePerf}>FPS</button>}
        <button className="bw-quick-action" onClick={() => setJournalOpen(true)} aria-haspopup="dialog"><span aria-hidden="true">⌘</span><span>Hành trình</span></button>
        <button className="profile-trigger bw-player-trigger" onClick={() => setProfileOpen(true)} aria-haspopup="dialog" aria-label="Mở hồ sơ người chơi"><span className="profile-trigger-avatar">{(user?.displayName ?? user?.username ?? "P").slice(0, 1).toUpperCase()}</span><span className="bw-player-name">{user?.displayName ?? user?.username}</span><span className="bw-chevron" aria-hidden="true">⌄</span></button>
        <button className="ghost bw-logout" onClick={async () => { disconnect(); await logout(); }}>Thoát</button>
      </div>
    </header>
    <TempleGuide />
    {import.meta.env.DEV && perfVisible && <aside data-ui className="performance-panel" aria-label="Thông số hiệu năng">
      <strong>Performance · DEV</strong><div><span>FPS</span><b>{perf.fps}</b></div><div><span>Frame avg / p95 / p99</span><b>{perf.frameMs.toFixed(1)} / {perf.frameP95Ms.toFixed(1)} / {perf.frameP99Ms.toFixed(1)} ms</b></div><div><span>Max / over 16.7 ms / over 33.3 ms</span><b>{perf.maxFrameMs.toFixed(1)} ms / {perf.overBudgetFrames} / {perf.hitchFrames}</b></div>
      <div><span>Draw calls</span><b>{perf.drawCalls}</b></div><div><span>Triangles</span><b>{perf.triangles.toLocaleString()}</b></div>
      <div><span>Geometries / Textures / Programs</span><b>{perf.geometries} / {perf.textures} / {perf.programs}</b></div><div><span>Rolling samples</span><b>{perf.sampleCount}</b></div>
    </aside>}
    {notice && <div data-ui className="toast bw-world-toast" role="status">{notice}</div>}
    {interactionMessage && <div data-ui className="checkpoint-status world-interaction-status" role="status">{interactionMessage}</div>}
    {nearbyInteraction ? <section data-ui className="checkpoint-panel world-interaction-panel bw-context-prompt" aria-live="polite">
      <strong>{nearbyInteraction.name}</strong><span>{nearbyInteraction.prompt}</span><button onClick={() => sendWorldInteraction(nearbyInteraction.id)}>Tương tác</button>
    </section> : nearbyCheckpoint && <section data-ui className="checkpoint-panel bw-context-prompt" aria-live="polite">
      <strong>{nearbyCheckpoint.name}</strong><span>{nearbyCheckpoint.description}</span>
      <button disabled={checkpointBusy} onClick={() => void activateCheckpoint(nearbyCheckpoint.id)}>{checkpointBusy ? "Đang lưu…" : touch ? "Lưu điểm dừng" : "E · Lưu điểm dừng"}</button>
    </section>}
    {checkpointMessage && <div data-ui className="checkpoint-status" role="status">{checkpointMessage}</div>}
    {!npcDialogue && profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
    {!npcDialogue && !profileOpen && journalOpen && <WorldJournal onClose={() => setJournalOpen(false)} />}
    {npcDialogue && <NpcDialogue dialogue={npcDialogue} onClose={() => useGame.getState().setNpcDialogue(null)} />}
    <VoiceChat /><ChatPanel />
    {touch ? <TouchControls /> : <p data-ui className="hint muted bw-control-hint">WASD di chuyển · Shift chạy · Space nhảy · E tương tác · kéo chuột xoay · lăn chuột zoom</p>}
  </>;
}
