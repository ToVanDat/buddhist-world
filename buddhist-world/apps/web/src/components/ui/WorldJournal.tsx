import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../stores/auth";

interface QuestObjective { targetId: string; count: number; label?: string }
interface Quest {
  id: string; title: string; description: string;
  objectives: QuestObjective[];
  rewards: { itemId: string; quantity: number }[];
  status: "active" | "completed" | "abandoned" | null;
  is_repeatable: boolean;
  progress: Record<string, number>;
}
interface InventoryItem {
  id: string; name: string; description: string; category: string; quantity: number;
}
interface WorldEvent { id: number; actor_name: string; target_id: string; interaction_kind: string; created_at: string }

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
  const [tab, setTab] = useState<"quests" | "inventory" | "activity">("quests");
  const [quests, setQuests] = useState<Quest[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [questData, inventoryData, eventData] = await Promise.all([api("/api/world/quests"), api("/api/world/inventory"), api("/api/world/events?limit=30")]);
      setQuests(questData.quests ?? []);
      setItems(inventoryData.items ?? []);
      setEvents(eventData.events ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dữ liệu thế giới chưa sẵn sàng. Hãy áp dụng migration 002_world_content.sql.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function accept(questId: string) {
    setBusyQuest(questId);
    setError(null);
    try {
      await api(`/api/world/quests/${encodeURIComponent(questId)}/accept`, { method: "POST" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhận nhiệm vụ.");
    } finally {
      setBusyQuest(null);
    }
  }


  async function abandon(questId: string) {
    setBusyQuest(questId);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/world/quests/${encodeURIComponent(questId)}/abandon`, { method: "POST" });
      setNotice("Đã từ bỏ nhiệm vụ. Bạn có thể nhận lại nếu nhiệm vụ cho phép.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể từ bỏ nhiệm vụ.");
    } finally {
      setBusyQuest(null);
    }
  }

  async function useOffering(itemId: string) {
    setBusyItem(itemId);
    setError(null);
    setNotice(null);
    try {
      const result = await api(`/api/world/inventory/${encodeURIComponent(itemId)}/use`, { method: "POST" });
      setNotice(result.message ?? "Đã sử dụng vật phẩm.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể sử dụng vật phẩm.");
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <div className="profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-panel world-journal" role="dialog" aria-modal="true" aria-labelledby="world-journal-title">
        <div className="profile-heading">
          <div><span className="profile-kicker">BUDDHIST WORLD</span><h2 id="world-journal-title">Hành trình của bạn</h2></div>
          <button className="ghost" onClick={onClose} aria-label="Đóng sổ hành trình">Đóng</button>
        </div>
        <div className="world-journal-tabs">
          <button aria-pressed={tab === "quests"} onClick={() => setTab("quests")}>Nhiệm vụ ({quests.length})</button>
          <button aria-pressed={tab === "inventory"} onClick={() => setTab("inventory")}>Vật phẩm ({items.length})</button>
          <button aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>Hoạt động ({events.length})</button>
          <button className="ghost" onClick={() => void load()} disabled={loading}>Làm mới</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="muted" role="status">{notice}</p>}
        {loading ? <p className="muted">Đang tải hành trình…</p> : tab === "quests" ? (
          <div className="world-journal-list">
            {quests.length === 0 && <p className="muted">Chưa có nhiệm vụ khả dụng.</p>}
            {quests.map((quest) => (
              <article className="world-journal-card" key={quest.id}>
                <div className="world-journal-card-heading">
                  <strong>{quest.title}</strong>
                  <span>{quest.status === "completed" ? "Hoàn thành" : quest.status === "active" ? "Đang thực hiện" : "Chưa nhận"}</span>
                </div>
                <p>{quest.description}</p>
                <ul>{quest.objectives.map((objective) => (
                  <li key={objective.targetId}>
                    {objective.label ?? objective.targetId}: {Math.min(quest.progress?.[objective.targetId] ?? 0, objective.count)}/{objective.count}
                  </li>
                ))}</ul>
                <small>Phần thưởng: {quest.rewards.map((reward) => `${reward.itemId} ×${reward.quantity}`).join(", ") || "Không có"}</small>
                {(!quest.status || quest.status === "abandoned" || (quest.status === "completed" && quest.is_repeatable)) && <button disabled={busyQuest === quest.id} onClick={() => void accept(quest.id)}>{busyQuest === quest.id ? "Đang xử lý…" : quest.status ? "Nhận lại nhiệm vụ" : "Nhận nhiệm vụ"}</button>}
                {quest.status === "active" && <button className="ghost" disabled={busyQuest === quest.id} onClick={() => void abandon(quest.id)}>{busyQuest === quest.id ? "Đang xử lý…" : "Từ bỏ nhiệm vụ"}</button>}
              </article>
            ))}
          </div>
        ) : tab === "inventory" ? (
          <div className="world-journal-list">
            {items.length === 0 && <p className="muted">Túi đồ hiện chưa có vật phẩm.</p>}
            {items.map((item) => (
              <article className="world-inventory-item" key={item.id}>
                <div><strong>{item.name}</strong><p>{item.description}</p><small>{item.category}</small></div>
                <div className="world-inventory-actions"><b>×{item.quantity}</b>{item.category === "offering" && <button disabled={busyItem === item.id} onClick={() => void useOffering(item.id)}>{busyItem === item.id ? "Đang dâng…" : "Dâng hương"}</button>}</div>
              </article>
            ))}
          </div>
        ) : (
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
        )}
      </section>
    </div>
  );
}
