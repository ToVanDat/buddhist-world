import { useEffect, useRef, useState } from "react";
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
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const lines = dialogue.dialogue?.length ? dialogue.dialogue : [{ id: "fallback", text: dialogue.response }];
  const currentLine = lines[Math.min(step, lines.length - 1)];
  const isLastStep = step >= lines.length - 1;

  useEffect(() => { setStep(0); setError(null); }, [dialogue]);

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

  async function accept(questId: string) {
    setBusyQuest(questId);
    setError(null);
    try {
      await acceptNpcQuest(questId);
      setAccepted((current) => current.includes(questId) ? current : [...current, questId]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhận nhiệm vụ.");
    } finally {
      setBusyQuest(null);
    }
  }

  return (
    <div className="profile-backdrop" role="presentation">
      <section ref={dialogRef} className="profile-panel npc-dialogue" role="dialog" aria-modal="true" aria-labelledby="npc-dialogue-title" aria-describedby="npc-dialogue-line">
        <span className="profile-kicker">GẶP GỠ NHÂN VẬT</span>
        <h2 id="npc-dialogue-title">{dialogue.name}</h2>
        <div className="npc-dialogue-progress" aria-label={`Lời thoại ${step + 1} trên ${lines.length}`}>
          <span>{String(step + 1).padStart(2, "0")} / {String(lines.length).padStart(2, "0")}</span>
          <div className="npc-dialogue-progress-track"><span style={{ width: `${((step + 1) / lines.length) * 100}%` }} /></div>
        </div>
        <p id="npc-dialogue-line" key={currentLine?.id} aria-live="polite">{currentLine?.text ?? dialogue.response}</p>
        {dialogue.completionNotice && <p className="npc-dialogue-notice" role="status">{dialogue.completionNotice}</p>}
        <div className="npc-dialogue-navigation">
          <button className="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Trước</button>
          {isLastStep
            ? <button onClick={onClose}>Kết thúc hội thoại</button>
            : <button onClick={() => setStep((value) => Math.min(lines.length - 1, value + 1))}>Tiếp theo</button>}
        </div>
        {isLastStep && dialogue.questOffers && dialogue.questOffers.length > 0 && (
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
        <button className="ghost npc-dialogue-close" onClick={onClose}>Đóng</button>
      </section>
    </div>
  );
}
