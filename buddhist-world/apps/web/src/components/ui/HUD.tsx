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
import { PartyPanel } from "./PartyPanel";
import { CommunityPanel } from "./CommunityPanel";
import { VoiceChat } from "./VoiceChat";
import { TouchControls } from "./Joystick";
import { ProfilePanel } from "./ProfilePanel";
import { TempleGuide } from "./TempleGuide";
import { WorldJournal } from "./WorldJournal";
import { NpcDialogue } from "./NpcDialogue";
import { QuestTracker } from "./QuestTracker";
import { MobileSettingsPanel } from "./MobileSettingsPanel";
import { OnboardingHint } from "./OnboardingHint";

const STATUS: Record<string, string> = {
  idle: "Chưa kết nối", connecting: "Đang kết nối…", "in-region": "Đã vào thế giới",
  reconnecting: "Đang kết nối lại…", error: "Mất kết nối",
};

function Icon({ name }: { name: "menu" | "prayer" | "meditation" | "settings" | "journal" | "profile" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "menu") return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
  if (name === "prayer") return <svg {...common}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8.5" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.6 4.6l2.8 2.8M16.6 16.6l2.8 2.8M19.4 4.6l-2.8 2.8M7.4 16.6l-2.8 2.8" /></svg>;
  if (name === "meditation") return <svg {...common}><path d="M12 3c-3.8 0-6.8 2.6-6.8 6.2 0 4.1 3.4 7.8 6.8 11 3.4-3.2 6.8-6.9 6.8-11C18.8 5.6 15.8 3 12 3Z" /><path d="M8.5 10.5c1.1 1 2.3 1.5 3.5 1.5s2.4-.5 3.5-1.5" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15.2 21 16.5l-1.6 2.7-1.9-.7a8 8 0 0 1-1.8 1l-.3 2h-3.1l-.3-2a8 8 0 0 1-1.8-1l-1.9.7-1.6-2.7 1.6-1.3a7 7 0 0 1 0-2L5.7 12l1.6-2.7 1.9.7a8 8 0 0 1 1.8-1l.3-2h3.1l.3 2a8 8 0 0 1 1.8 1l1.9-.7L20 12l-1.6 1.2a7 7 0 0 1 0 2Z" transform="translate(-1 -1)" /></svg>;
  if (name === "journal") return <svg {...common}><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22V4.5Z" /><path d="M5 5v17M9 7h7M9 11h7M9 15h5" /></svg>;
  return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
}

export function HUD({ onOpenMenu, onOpenPrayer, onOpenMeditation }: { onOpenMenu: () => void; onOpenPrayer: () => void; onOpenMeditation: () => void }) {
  const { status, regionId, notice, remoteIds, spawn } = useNet();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { nearbyCheckpoint, checkpointMessage, checkpointBusy, nearbyInteraction, interactionMessage, npcDialogue, cameraMode } = useGame();
  const touch = typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
  const [profileOpen, setProfileOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const perfVisible = usePerformance((s) => s.visible);
  const perf = usePerformance((s) => s.snapshot);
  const togglePerf = usePerformance((s) => s.toggle);

  useEffect(() => {
    document.documentElement.dataset.cameraMode = cameraMode;
    return () => { delete document.documentElement.dataset.cameraMode; };
  }, [cameraMode]);
  useEffect(() => {
    const blocked = profileOpen || journalOpen || settingsOpen || partyOpen || communityOpen || utilityOpen || Boolean(npcDialogue);
    setGameplayInputBlocked(blocked);
    return () => setGameplayInputBlocked(false);
  }, [profileOpen, journalOpen, settingsOpen, partyOpen, communityOpen, utilityOpen, npcDialogue]);

  return <>
    <header data-ui className="hud-top bw-hud-top">
      <div className="bw-hud-location" aria-label="Thông tin khu vực">
        <span className="bw-hud-eyebrow">BUDDHIST WORLD</span>
        <strong className="region">{regionId ? REGIONS[regionId]?.name : "Cõi Chùa"}</strong>
        <span className="bw-hud-presence"><i className={`bw-status-dot is-${status}`} aria-hidden="true" />{STATUS[status]} <span aria-hidden="true">·</span> {remoteIds.length} khách tham quan gần</span>
      </div>
      <nav className="hud-actions bw-hud-actions bw-hud-primary-actions" aria-label="Điều khiển thế giới">
        <button className="bw-icon-action" type="button" onClick={onOpenMenu} aria-label="Mở menu chính" title="Menu chính"><Icon name="menu" /><span>Menu</span></button>
        <button className="bw-icon-action" type="button" onClick={onOpenPrayer} aria-label="Mở niệm Phật" title="Niệm Phật"><Icon name="prayer" /><span>Niệm Phật</span></button>
        <button className="bw-icon-action" type="button" onClick={onOpenMeditation} aria-label="Mở thiền định" title="Thiền định"><Icon name="meditation" /><span>Thiền</span></button>
        {import.meta.env.DEV && <button className="bw-icon-action bw-dev-action" aria-pressed={perfVisible} onClick={togglePerf}>FPS</button>}
        <div className="bw-hud-utility">
          <button className={`bw-icon-action bw-utility-trigger${utilityOpen ? " is-open" : ""}`} type="button" onClick={() => setUtilityOpen((value) => !value)} aria-expanded={utilityOpen} aria-haspopup="true" aria-label="Mở tiện ích" title="Tiện ích">
            <span aria-hidden="true">☷</span><span>Tiện ích</span><i aria-hidden="true">{utilityOpen ? "−" : "+"}</i>
          </button>
          {utilityOpen && <div className="bw-utility-menu" role="group" aria-label="Tiện ích và tài khoản">
            <span className="bw-utility-label">CỘNG ĐỒNG</span>
            <button type="button" onClick={() => { setUtilityOpen(false); setCommunityOpen(true); }}>Cộng đồng <small>Trao đổi cùng khách tham quan</small></button>
            <button type="button" onClick={() => { setUtilityOpen(false); setPartyOpen(true); }}>Cùng tham quan <small>Nhóm và bạn đồng hành</small></button>
            <span className="bw-utility-label">CÁ NHÂN</span>
            <button type="button" onClick={() => { setUtilityOpen(false); setJournalOpen(true); }}>Hành trình <small>Nhật ký và điểm đã ghé</small></button>
            <button type="button" onClick={() => { setUtilityOpen(false); setSettingsOpen(true); }}>Cài đặt <small>Âm thanh, hiển thị và điều khiển</small></button>
            <button type="button" onClick={() => { setUtilityOpen(false); setProfileOpen(true); }}>Hồ sơ <small>{user?.displayName ?? user?.username}</small></button>
            <button type="button" className="is-danger" onClick={async () => { setUtilityOpen(false); disconnect(); await logout(); }}>Thoát thế giới</button>
          </div>}
        </div>
      </nav>   </header>
    {!spawn && status !== "in-region" && <div data-ui className="toast bw-world-toast bw-offline-exploration-notice" role="status">Đang dùng điểm xuất phát dự phòng: bạn vẫn có thể di chuyển và khám phá khuôn viên. NPC, nhiệm vụ, lưu checkpoint, chat và multiplayer cần máy chủ kết nối. Trạng thái: {STATUS[status] ?? status}.</div>}
    <TempleGuide /><QuestTracker /><OnboardingHint touch={touch} />
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
      {!npcDialogue && !profileOpen && !journalOpen && !settingsOpen && !communityOpen && partyOpen && <PartyPanel onClose={() => setPartyOpen(false)} />}
      {!npcDialogue && !profileOpen && !journalOpen && !settingsOpen && !partyOpen && communityOpen && <CommunityPanel onClose={() => setCommunityOpen(false)} />}
      {npcDialogue && <NpcDialogue dialogue={npcDialogue} onClose={() => useGame.getState().setNpcDialogue(null)} />}
    </AnimatePresence>
    <VoiceChat /><ChatPanel />
    {touch ? <TouchControls /> : <p data-ui className="hint muted bw-control-hint">WASD di chuyển · Shift chạy · Space nhảy · E tương tác · kéo chuột xoay · lăn chuột zoom</p>}
  </>;
}
