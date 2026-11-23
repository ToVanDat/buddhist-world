import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";
import { getQuestProgress } from "./journalModel";
import { AsyncOperationFence } from "../../utils/AsyncOperationFence";
import { AsyncMutationGate } from "../../utils/AsyncMutationGate";

interface QuestObjective { targetId: string; count: number; label?: string }
interface Quest {
  id: string; title: string; description: string;
  objectives: QuestObjective[];
  rewards: { itemId: string; quantity: number }[];
  status: "active" | "completed" | "abandoned" | null;
  is_repeatable: boolean;
  progress: Record<string, number>;
  accepted_at?: string;
  completed_at?: string | null;
}
interface InventoryItem {
  id: string; name: string; description: string; category: string; quantity: number; stack_limit?: number;
}
interface WorldEvent { id: number; actor_name: string; target_id: string; interaction_kind: string; created_at: string }
interface Achievement {
  id: string; title: string; description: string; category: string; icon: string;
  progress: number; target_count: number; unlocked_at: string | null;
}

async function api(path: string, init?: RequestInit) {
  const send = () => fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${useAuth.getState().accessToken ?? ""}`, ...init?.headers },
  });
  let response = await send();
  if (response.status === 401 && await useAuth.getState().refresh()) response = await send();
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Không thể tải dữ liệu hành trình.");
  return data;
}

export function WorldJournal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const loadFenceRef = useRef(new AsyncOperationFence());
  const mutationFenceRef = useRef(new AsyncOperationFence());
  const mutationGateRef = useRef(new AsyncMutationGate());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reduceMotion = useReducedMotion();
  const [inventorySearch, setInventorySearch] = useState("");
  const [tab, setTab] = useState<"quests" | "inventory" | "activity" | "achievements">("quests");
  const [questFilter, setQuestFilter] = useState<"all" | "active" | "completed">("all");
  const [quests, setQuests] = useState<Quest[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achievementError, setAchievementError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const operation = loadFenceRef.current.begin();
    setLoading(true);
    setError(null);
    try {
      const [questData, inventoryData, eventData] = await Promise.all([
        api("/api/world/quests"), api("/api/world/inventory"), api("/api/world/events?limit=30"),
      ]);
      if (!loadFenceRef.current.isCurrent(operation)) return;
      setQuests(questData.quests ?? []);
      setItems(inventoryData.items ?? []);
      setEvents(eventData.events ?? []);
      try {
        const achievementData = await api("/api/world/achievements");
        if (!loadFenceRef.current.isCurrent(operation)) return;
        setAchievements(achievementData.achievements ?? []);
        setAchievementError(null);
      } catch {
        if (!loadFenceRef.current.isCurrent(operation)) return;
        // Keep the core journal usable while the additive achievements migration is pending.
        setAchievements([]);
        setAchievementError("Thành tựu chưa sẵn sàng. Cần áp dụng migration 005_world_achievements.sql trong môi trường đã sao lưu.");
      }
    } catch (cause) {
      if (loadFenceRef.current.isCurrent(operation)) {
        setError(cause instanceof Error ? cause.message : "Dữ liệu thế giới chưa sẵn sàng. Hãy áp dụng migration 002_world_content.sql.");
      }
    } finally {
      if (loadFenceRef.current.isCurrent(operation)) setLoading(false);
    }
  }, []);

  useEffect(() => () => {
    loadFenceRef.current.invalidate();
    mutationFenceRef.current.invalidate();
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  const visibleItems = items.filter((item) => (item.name + " " + item.description + " " + item.category).toLocaleLowerCase().includes(inventorySearch.trim().toLocaleLowerCase()));
  const visibleQuests = quests.filter((quest) => {
    if (questFilter === "active") return quest.status === "active";
    if (questFilter === "completed") return quest.status === "completed";
    return true;
  });

  async function accept(questId: string) {
    if (!mutationGateRef.current.tryAcquire()) return;
    const operation = mutationFenceRef.current.begin();
    setBusyQuest(questId);
    setError(null);
    try {
      await api(`/api/world/quests/${encodeURIComponent(questId)}/accept`, { method: "POST" });
      if (!mutationFenceRef.current.isCurrent(operation)) return;
      useGame.getState().refreshQuestTracker();
      await load();
    } catch (cause) {
      if (mutationFenceRef.current.isCurrent(operation)) {
        setError(cause instanceof Error ? cause.message : "Không thể bắt đầu khám phá.");
      }
    } finally {
      if (mutationFenceRef.current.isCurrent(operation)) setBusyQuest(null);
      if (mutationFenceRef.current.isCurrent(operation)) mutationGateRef.current.release();
    }
  }


  async function abandon(questId: string) {
    if (!mutationGateRef.current.tryAcquire()) return;
    const operation = mutationFenceRef.current.begin();
    setBusyQuest(questId);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/world/quests/${encodeURIComponent(questId)}/abandon`, { method: "POST" });
      if (!mutationFenceRef.current.isCurrent(operation)) return;
      useGame.getState().refreshQuestTracker();
      setNotice("Đã rời điểm khám phá. Bạn có thể quay lại sau.");
      await load();
    } catch (cause) {
      if (mutationFenceRef.current.isCurrent(operation)) {
        setError(cause instanceof Error ? cause.message : "Không thể rời điểm khám phá.");
      }
    } finally {
      if (mutationFenceRef.current.isCurrent(operation)) setBusyQuest(null);
      if (mutationFenceRef.current.isCurrent(operation)) mutationGateRef.current.release();
    }
  }

  async function useOffering(itemId: string) {
    if (!mutationGateRef.current.tryAcquire()) return;
    const operation = mutationFenceRef.current.begin();
    setBusyItem(itemId);
    setError(null);
    setNotice(null);
    try {
      const result = await api(`/api/world/inventory/${encodeURIComponent(itemId)}/use`, { method: "POST" });
      if (!mutationFenceRef.current.isCurrent(operation)) return;
      setNotice(result.message ?? "Đã thực hiện nghi thức.");
      await load();
    } catch (cause) {
      if (mutationFenceRef.current.isCurrent(operation)) {
        setError(cause instanceof Error ? cause.message : "Không thể thực hiện thao tác với lễ phẩm.");
      }
    } finally {
      if (mutationFenceRef.current.isCurrent(operation)) setBusyItem(null);
      if (mutationFenceRef.current.isCurrent(operation)) mutationGateRef.current.release();
    }
  }

  return (
    <motion.div className="profile-backdrop bw-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? .01 : .18 }}>
      <motion.section ref={dialogRef} className="profile-panel world-journal" role="dialog" aria-modal="true" aria-labelledby="world-journal-title" initial={reduceMotion ? false : { opacity: 0, y: 16, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: reduceMotion ? .01 : .22 }}>
        <div className="profile-heading">
          <div><span className="profile-kicker">BUDDHIST WORLD</span><h2 id="world-journal-title">Hành trình của bạn</h2></div>
          <button className="ghost" onClick={onClose} aria-label="Đóng sổ hành trình">Đóng</button>
        </div>
        <div className="world-journal-tabs">
          <button aria-pressed={tab === "quests"} onClick={() => setTab("quests")}>Điểm khám phá ({quests.length})</button>
          <button aria-pressed={tab === "inventory"} onClick={() => setTab("inventory")}>Lễ phẩm & kỷ vật ({items.length})</button>
          <button aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>Dấu chân ({events.length})</button>
          <button aria-pressed={tab === "achievements"} onClick={() => setTab("achievements")}>Ghi dấu ({achievements.filter((item) => item.unlocked_at).length}/{achievements.length})</button>
          <button className="ghost" onClick={() => void load()} disabled={loading}>Làm mới</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <motion.p className="bw-journal-feedback" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{notice}</motion.p>}
        {loading ? <p className="muted">Đang mở sổ tham quan…</p> : tab === "quests" ? (
          <div className="world-journal-list">
            <div className="world-journal-filters" aria-label="Lọc điểm khám phá">
              <button aria-pressed={questFilter === "all"} onClick={() => setQuestFilter("all")}>Tất cả</button>
              <button aria-pressed={questFilter === "active"} onClick={() => setQuestFilter("active")}>Đang tìm hiểu</button>
              <button aria-pressed={questFilter === "completed"} onClick={() => setQuestFilter("completed")}>Đã khám phá</button>
            </div>
            {visibleQuests.length === 0 && <p className="muted">{questFilter === "all" ? "Chưa có điểm khám phá khả dụng." : "Không có điểm khám phá trong bộ lọc này."}</p>}
            {visibleQuests.map((quest) => {
              const progress = getQuestProgress(quest.objectives, quest.progress);
              return <article className={`world-journal-card${quest.status === "completed" ? " is-completed" : ""}`} key={quest.id}>
                <div className="world-journal-card-heading">
                  <strong>{quest.title}</strong>
                  <span>{quest.status === "completed" ? "Đã khám phá" : quest.status === "active" ? "Đang tìm hiểu" : quest.status === "abandoned" ? "Đã rời" : "Chưa khám phá"}</span>
                </div>
                <p>{quest.description}</p>
                <div className="quest-progress" role="progressbar" aria-label={`Tiến độ ${quest.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                  <div><span>Tiến độ</span><b>{progress.completed}/{progress.total}</b></div>
                  <span className="quest-progress-track"><span style={{ width: `${progress.percent}%` }} /></span>
                </div>
                <ul>{quest.objectives.map((objective) => (
                  <li key={objective.targetId}>
                    {objective.label ?? objective.targetId}: {Math.min(quest.progress?.[objective.targetId] ?? 0, objective.count)}/{objective.count}
                  </li>
                ))}</ul>
                <small></small>
                {quest.status === "completed" && quest.completed_at && <small>Đã khám phá: {new Date(quest.completed_at).toLocaleString()}</small>}
                {(!quest.status || quest.status === "abandoned" || (quest.status === "completed" && quest.is_repeatable)) && <button disabled={busyQuest !== null || busyItem !== null} onClick={() => void accept(quest.id)}>{busyQuest === quest.id ? "Đang xử lý…" : quest.status ? "Khám phá lại" : "Bắt đầu tìm hiểu"}</button>}
                {quest.status === "active" && <button className="ghost" disabled={busyQuest !== null || busyItem !== null} onClick={() => void abandon(quest.id)}>{busyQuest === quest.id ? "Đang xử lý…" : "Rời điểm khám phá"}</button>}
              </article>;
            })}
          </div>
        ) : tab === "inventory" ? (
          <div className="world-journal-list">
            <label className="bw-journal-search"><span>Tìm lễ phẩm hoặc kỷ vật</span><input type="search" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Tên hoặc mô tả…" /></label>
            {items.length === 0 && <p className="muted">Chưa có lễ phẩm hoặc kỷ vật được ghi nhận.</p>}
            {items.length > 0 && visibleItems.length === 0 && <p className="muted">Không tìm thấy mục phù hợp.</p>}
            {visibleItems.map((item) => (
              <article className="world-inventory-item bw-inventory-card" key={item.id}>
                <span className="bw-item-mark" aria-hidden="true">{item.category === "offering" ? "✧" : item.category === "quest" ? "◇" : "◈"}</span><div><strong>{item.name}</strong><p>{item.description}</p><small>{item.category === "offering" ? "Lễ phẩm" : "Kỷ vật"}</small></div>
                <div className="world-inventory-actions"><b>×{item.quantity}{item.stack_limit ? ` / ${item.stack_limit}` : ""}</b>{item.category === "offering" && <button disabled={busyQuest !== null || busyItem !== null} onClick={() => void useOffering(item.id)}>{busyItem === item.id ? "Đang dâng…" : "Dâng hương"}</button>}</div>
              </article>
            ))}
          </div>
        ) : tab === "activity" ? (
          <div className="world-journal-list">
            {events.length === 0 && <p className="muted">Chưa có hoạt động nào được ghi nhận tại khu vực này.</p>}
            {events.map((event) => (
              <article className="world-inventory-item" key={event.id}>
                <div>
                  <strong>{event.actor_name}</strong>
                  <p>{event.interaction_kind === "bell" ? "Thỉnh chuông chùa" : event.interaction_kind === "incense" ? "Dâng hương" : event.interaction_kind === "buddha" ? "Chiêm bái tượng Phật" : event.interaction_kind === "altar" ? "Lễ tại bàn thờ" : "Trò chuyện với NPC"}</p>
                  <small>{new Date(event.created_at).toLocaleString()}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="world-journal-list">
            {achievementError && <p className="muted" role="status">{achievementError}</p>}
            {!achievementError && achievements.length === 0 && <p className="muted">Chưa có dấu ấn khám phá nào được ghi nhận.</p>}
            {achievements.map((achievement) => {
              const percent = achievement.target_count > 0
                ? Math.round((Math.min(achievement.progress, achievement.target_count) / achievement.target_count) * 100)
                : 0;
              return <article className={`world-journal-card achievement-card${achievement.unlocked_at ? " is-unlocked" : ""}`} key={achievement.id}>
                <div className="achievement-heading">
                  <span aria-hidden="true">{achievement.icon}</span>
                  <div><strong>{achievement.title}</strong><small>{achievement.unlocked_at ? "Đã ghi dấu" : "Chưa ghi nhận"}</small></div>
                </div>
                <p>{achievement.description}</p>
                <div className="quest-progress" role="progressbar" aria-label={`Tiến độ khám phá ${achievement.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                  <div><span>Khám phá</span><b>{achievement.progress}/{achievement.target_count}</b></div>
                  <span className="quest-progress-track"><span style={{ width: `${percent}%` }} /></span>
                </div>
                {achievement.unlocked_at && <small>Ghi nhận: {new Date(achievement.unlocked_at).toLocaleString()}</small>}
              </article>;
            })}
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}
