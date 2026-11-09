import { useEffect, useRef, useState } from "react";
import { useNet } from "../../stores/net";
import { sendChat } from "../../game/multiplayer/socket";

export function ChatPanel() {
  const chat = useNet((s) => s.chat);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat.length]);
  return (
    <div data-ui className="chat">
      <div className="chat-log" aria-live="polite">
        {chat.map((m) => (
          // React escape văn bản → không có XSS; không dùng innerHTML.
          <p key={m.id}><b>{m.from}</b> {m.text}</p>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { sendChat(text.trim()); setText(""); } }}>
        <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Nhắn cho người ở gần…" aria-label="Tin nhắn" />
      </form>
    </div>
  );
}
