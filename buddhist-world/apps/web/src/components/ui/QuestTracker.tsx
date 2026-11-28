import { useEffect, useState } from "react";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";
import { getQuestProgress, normalizeActiveQuests, type ActiveQuestView } from "./journalModel";

async function loadActiveQuests(): Promise<ActiveQuestView[]> {
  const send = () => fetch("/api/world/quests", {
    credentials: "include",
    headers: { Authorization: "Bearer " + (useAuth.getState().accessToken ?? "") },
  });
  let response = await send();
  if (response.status === 401 && await useAuth.getState().refresh()) response = await send();
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : "Không thể cập nhật điểm khám phá.";
    throw new Error(message);
  }
  const quests = data && typeof data === "object" && "quests" in data ? data.quests : [];
  return normalizeActiveQuests(quests);
}

export function QuestTracker() {
  const lastInteractionAt = useGame((state) => state.lastWorldInteraction?.at ?? 0);
  const questRevision = useGame((state) => state.questRevision);
  const [quests, setQuests] = useState<ActiveQuestView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    let current = true;
    setLoading(true);
    void loadActiveQuests().then((result) => {
      if (current) { setQuests(result); setError(null); }
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : "Không thể cập nhật điểm khám phá.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [lastInteractionAt, questRevision, retry]);
  if (quests.length === 0 && !error) return null;
  return <aside data-ui className={`bw-quest-tracker${collapsed ? " is-collapsed" : ""}`} aria-label="Điểm khám phá đang theo dõi">
    <div className="bw-quest-tracker-heading">
      <strong>Điểm khám phá</strong>
      <span>{loading ? "ĐANG CẬP NHẬT" : quests.length + " ĐIỂM KHÁM PHÁ"}</span>
      <button type="button" className="bw-panel-toggle" aria-label={collapsed ? "Mở danh sách điểm khám phá" : "Thu gọn điểm khám phá"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "+" : "−"}</button>
    </div>
    {!collapsed && (error
      ? <div className="bw-quest-tracker-error" role="status"><span>{error}</span><button className="ghost" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></div>
      : <div className="bw-quest-tracker-list" aria-live="polite">
        {quests.slice(0, 2).map((quest) => {
          const progress = getQuestProgress(quest.objectives, quest.progress);
          return <article className="bw-quest-tracker-item" key={quest.id}>
            <strong>{quest.title}</strong>
            <div className="bw-quest-tracker-progress"><span>Đã tìm hiểu</span><b>{progress.completed}/{progress.total} · {progress.percent}%</b></div>
            <div className="bw-quest-tracker-track" role="progressbar" aria-label={"Tiến độ " + quest.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{ width: progress.percent + "%" }} /></div>
            <ul className="bw-quest-tracker-objectives">{quest.objectives.slice(0, 3).map((objective) => <li key={objective.targetId}><span>{objective.label ?? objective.targetId}</span><b>{Math.min(quest.progress[objective.targetId] ?? 0, objective.count)}/{objective.count}</b></li>)}</ul>
          </article>;
        })}
        {quests.length > 2 && <span className="muted" style={{ fontSize: ".65rem" }}>Còn {quests.length - 2} điểm khám phá khác trong sổ hành trình</span>}
      </div>)}
  </aside>;
}
