import type { NpcDialogueState } from "../../stores/game";

export function NpcDialogue({ dialogue, onClose }: { dialogue: NpcDialogueState; onClose: () => void }) {
  return (
    <div className="profile-backdrop" role="presentation">
      <section className="profile-panel npc-dialogue" role="dialog" aria-modal="true" aria-labelledby="npc-dialogue-title">
        <span className="profile-kicker">GẶP GỠ NHÂN VẬT</span>
        <h2 id="npc-dialogue-title">{dialogue.name}</h2>
        <p>{dialogue.response}</p>
        <button onClick={onClose}>Tiếp tục tham quan</button>
      </section>
    </div>
  );
}
