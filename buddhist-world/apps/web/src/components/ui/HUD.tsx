import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { REGIONS } from "@bw/shared";
import { useNet } from "../../stores/net";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";
import { usePerformance } from "../../stores/performance";
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
import { QuestTracker } from "./QuestTracker";
import { MobileSettingsPanel } from "./MobileSettingsPanel";

const STATUS: Record<string, string> = {
  idle: "Chưa kết nối", connecting: "Đang kết nối…", "in-region": "Đã vào thế giới",
  reconnecting: "Đang kết nối lại…", error: "Mất kết nối",
};

function Icon({ name }: { name: "settings" | "journal" | "profile" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15.2 21 16.5l-1.6 2.7-1.9-.7a8 8 0 0 1-1.8 1l-.3 2h-3.1l-.3-2a8 8 0 0 1-1.8-1l-1.9.7-1.6-2.7 1.6-1.3a7 7 0 0 1 0-2L5.7 12l1.6-2.7 1.9.7a8 8 0 0 1 1.8-1l.3-2h3.1l.3 2a8 8 0 0 1 1.8 1l1.9-.7L20 12l-1.6 1.2a7 7 0 0 1 0 2Z" transform="translate(-1 -1)" /></svg>;
  if (name === "journal") return <svg {...common}><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22V4.5Z" /><path d="M5 5v17M9 7h7M9 11h7M9 15h5" /></svg>;
  return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
}

export function HUD() {
  const { status, regionId, notice, remoteIds } = useNet();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { nearbyCheckpoint, checkpointMessage, checkpointBusy, nearbyInteraction, interactionMessage, npcDialogue, cameraMode } = useGame();
  const touch = typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
  const [profileOpen, setProfileOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const perfVisible = usePerformance((s) => s.visible);
  const perf = usePerformance((s) => s.snapshot);
  const togglePerf = usePerformance((s) => s.toggle);

  useEffect(() => {
    document.documentElement.dataset.cameraMode = cameraMode;
    return () => { delete document.documentElement.dataset.cameraMode; };
  }, [cameraMode]);
  useEffect(() => {
    const blocked = profileOpen || journalOpen || settingsOpen || Boolean(npcDialogue);
    setGameplayInputBlocked(blocked);
    return () => setGameplayInputBlocked(false);
  }, [profileOpen, journalOpen, settingsOpen, npcDialogue]);

  return <>
    <header data-ui className="hud-top bw-hud-top">
      <div className="bw-hud-location" aria-label="Thông tin khu vực">
        <span className="bw-hud-eyebrow">BUDDHIST WORLD</span>
        <strong className="region">{regionId ? REGIONS[regionId]?.name : "Cõi Chùa"}</strong>
        <span className="bw-hud-presence"><i className={`bw-status-dot is-${status}`} aria-hidden="true" />{STATUS[status]} <span aria-hidden="true">·</span> {remoteIds.length} người ở gần</span>
      </div>
      <nav className="hud-actions bw-hud-actions" aria-label="Menu thế giới">
        {import.meta.env.DEV && <button className="bw-icon-action bw-dev-action" aria-pressed={perfVisible} onClick={togglePerf}>FPS</button>}
        <button className="bw-icon-action" type="button" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog" aria-label="Mở cài đặt" title="Cài đặt"><Icon name="settings" /><span>Cài đặt</span></button>
        <button className="bw-icon-action" type="button" onClick={() => setJournalOpen(true)} aria-haspopup="dialog" aria-label="Mở hành trình" title="Hành trình"><Icon name="journal" /><span>Hành trình</span></button>
        <button className="bw-player-trigger" type="button" onClick={() => setProfileOpen(true)} aria-haspopup="dialog" aria-label="Mở hồ sơ người chơi" title="Hồ sơ">
          <span className="profile-trigger-avatar">{(user?.displayName ?? user?.username ?? "P").slice(0, 1).toUpperCase()}</span>
          <span className="bw-player-name">{user?.displayName ?? user?.username}</span><Icon name="profile" />
        </button>
        <button className="ghost bw-logout" type="button" onClick={async () => { disconnect(); await logout(); }}>Thoát</button>
      </nav>
    </header>
    <TempleGuide /><QuestTracker />
    {import.meta.env.DEV && perfVisible && <aside data-ui className="performance-panel" aria-label="Thông số hiệu năng">
      <strong>Performance · DEV</strong><div><span>FPS</span><b>{perf.fps}</b></div><div><span>Frame avg / p95 / p99</span><b>{perf.frameMs.toFixed(1)} / {perf.frameP95Ms.toFixed(1)} / {perf.frameP99Ms.toFixed(1)} ms</b></div><div><span>Max / over 16.7 ms / over 33.3 ms</span><b>{perf.maxFrameMs.toFixed(1)} ms / {perf.overBudgetFrames} / {perf.hitchFrames}</b></div>
      <div><span>Draw calls</span><b>{perf.drawCalls}</b></div><div><span>Triangles</span><b>{perf.triangles.toLocaleString()}</b></div><div><span>Geometries / Textures / Programs</span><b>{perf.geometries} / {perf.textures} / {perf.programs}</b></div><div><span>Rolling samples</span><b>{perf.sampleCount}</b></div>
    </aside>}
    {notice && <div data-ui className="toast bw-world-toast" role="status">{notice}</div>}
    {interactionMessage && <div data-ui className="checkpoint-status world-interaction-status" role="status">{interactionMessage}</div>}
    {nearbyInteraction ? <section data-ui className="checkpoint-panel world-interaction-panel bw-context-prompt" aria-live="polite">
      <span className="bw-prompt-kicker">TƯƠNG TÁC GẦN ĐÂY</span><strong>{nearbyInteraction.name}</strong><span>{nearbyInteraction.prompt}</span>
      <button type="button" onClick={() => sendWorldInteraction(nearbyInteraction.id)}>Tương tác <span aria-hidden="true">↗</span></button>
    </section> : nearbyCheckpoint && <section data-ui className="checkpoint-panel bw-context-prompt" aria-live="polite">
      <span className="bw-prompt-kicker">ĐIỂM DỪNG</span><strong>{nearbyCheckpoint.name}</strong><span>{nearbyCheckpoint.description}</span>
      <button type="button" disabled={checkpointBusy} onClick={() => void activateCheckpoint(nearbyCheckpoint.id)}>{checkpointBusy ? "Đang lưu…" : touch ? "Lưu điểm dừng" : "E · Lưu điểm dừng"}</button>
    </section>}
    {checkpointMessage && <div data-ui className="checkpoint-status" role="status">{checkpointMessage}</div>}
    <AnimatePresence>
      {!npcDialogue && settingsOpen && <MobileSettingsPanel onClose={closeSettings} />}
      {!npcDialogue && profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
      {!npcDialogue && !profileOpen && journalOpen && <WorldJournal onClose={() => setJournalOpen(false)} />}
      {npcDialogue && <NpcDialogue dialogue={npcDialogue} onClose={() => useGame.getState().setNpcDialogue(null)} />}
    </AnimatePresence>
    <VoiceChat /><ChatPanel />
    {touch ? <TouchControls /> : <p data-ui className="hint muted bw-control-hint">WASD di chuyển · Shift chạy · Space nhảy · E tương tác · kéo chuột xoay · lăn chuột zoom</p>}
  </>;
}
