import { useEffect, useState } from "react";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";
import { getQuestProgress } from "./journalModel";

interface QuestObjective { targetId: string; count: number; label?: string }
interface ActiveQuest {
  id: string;
  title: string;
  objectives: QuestObjective[];
  progress: Record<string, number>;
  status: "active" | "completed" | "abandoned" | null;
}

async function loadActiveQuests(): Promise<ActiveQuest[]> {
  const send = () => fetch("/api/world/quests", {
    credentials: "include",
    headers: { Authorization: "Bearer " + (useAuth.getState().accessToken ?? "") },
  });
  let response = await send();
  if (response.status === 401 && await useAuth.getState().refresh()) response = await send();
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Không thể cập nhật nhiệm vụ.");
  return (data.quests ?? []).filter((quest: ActiveQuest) => quest.status === "active");
}

export function QuestTracker() {
  const lastInteractionAt = useGame((state) => state.lastWorldInteraction?.at ?? 0);
  const [quests, setQuests] = useState<ActiveQuest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void loadActiveQuests()
      .then((result) => {
        if (!current) return;
        setQuests(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setError(cause instanceof Error ? cause.message : "Không thể cập nhật nhiệm vụ.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [lastInteractionAt, retry]);

  if (quests.length === 0 && !error) return null;

  return (
    <aside data-ui className="bw-quest-tracker" aria-label="Nhiệm vụ đang thực hiện">
      <div className="bw-quest-tracker-heading">
        <strong>Hành trình đang theo đuổi</strong>
        <span>{loading ? "ĐANG CẬP NHẬT" : quests.length + " NHIỆM VỤ"}</span>
      </div>
      {error ? (
        <div className="bw-quest-tracker-error" role="status">
          <span>{error}</span>
          <button className="ghost" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button>
        </div>
      ) : (
        <div className="bw-quest-tracker-list" aria-live="polite">
          {quests.slice(0, 2).map((quest) => {
            const progress = getQuestProgress(quest.objectives ?? [], quest.progress ?? {});
            return (
              <article className="bw-quest-tracker-item" key={quest.id}>
                <strong>{quest.title}</strong>
                <div className="bw-quest-tracker-progress">
                  <span>Mục tiêu</span><b>{progress.completed}/{progress.total} · {progress.percent}%</b>
                </div>
                <div className="bw-quest-tracker-track" role="progressbar" aria-label={"Tiến độ " + quest.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                  <span style={{ width: progress.percent + "%" }} />
                </div>
                <ul className="bw-quest-tracker-objectives">
                  {quest.objectives.slice(0, 3).map((objective) => (
                    <li key={objective.targetId}>
                      <span>{objective.label ?? objective.targetId}</span>
                      <b>{Math.min(quest.progress?.[objective.targetId] ?? 0, objective.count)}/{objective.count}</b>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
          {quests.length > 2 && <span className="muted" style={{ fontSize: ".65rem" }}>Còn {quests.length - 2} nhiệm vụ khác trong sổ hành trình</span>}
        </div>
      )}
    </aside>
  );
}
