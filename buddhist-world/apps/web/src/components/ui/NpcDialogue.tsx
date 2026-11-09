import { useState } from "react";
import { useAuth } from "../../stores/auth";
import type { NpcDialogueState } from "../../stores/game";

async function acceptNpcQuest(questId: string) {
  const send = () => fetch(`/api/world/quests/${encodeURIComponent(questId)}/accept`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${useAuth.getState().accessToken ?? ""}`,
    },
  });
  let response = await send();
  if (response.status === 401 && await useAuth.getState().refresh()) response = await send();
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Không thể nhận nhiệm vụ.");
}

export function NpcDialogue({ dialogue, onClose }: { dialogue: NpcDialogueState; onClose: () => void }) {
  const [busyQuest, setBusyQuest] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function accept(questId: string) {
    setBusyQuest(questId);
    setError(null);
    try {
      await acceptNpcQuest(questId);
      setAccepted((current) => [...current, questId]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhận nhiệm vụ.");
    } finally {
      setBusyQuest(null);
    }
  }

  return (
    <div className="profile-backdrop" role="presentation">
      <section className="profile-panel npc-dialogue" role="dialog" aria-modal="true" aria-labelledby="npc-dialogue-title">
        <span className="profile-kicker">GẶP GỠ NHÂN VẬT</span>
        <h2 id="npc-dialogue-title">{dialogue.name}</h2>
        <p>{dialogue.response}</p>
        {dialogue.questOffers && dialogue.questOffers.length > 0 && (
          <div className="npc-quest-offers">
            <strong>Nhiệm vụ dành cho bạn</strong>
            {dialogue.questOffers.map((quest) => (
              <article key={quest.id}>
                <b>{quest.title}</b>
                <span>{quest.description}</span>
                <small>Phần thưởng: {quest.rewards.map((reward) => `${reward.itemId} ×${reward.quantity}`).join(", ") || "Không có"}</small>
                <button disabled={busyQuest === quest.id || accepted.includes(quest.id)} onClick={() => void accept(quest.id)}>
                  {accepted.includes(quest.id) ? "Đã nhận" : busyQuest === quest.id ? "Đang nhận…" : "Nhận nhiệm vụ"}
                </button>
              </article>
            ))}
          </div>
        )}
        {error && <span className="error" role="alert">{error}</span>}
        <button onClick={onClose}>Tiếp tục tham quan</button>
      </section>
    </div>
  );
}
