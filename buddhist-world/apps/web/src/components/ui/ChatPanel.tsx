import { useEffect, useRef, useState } from "react";
import { useNet } from "../../stores/net";
import { sendChat } from "../../game/multiplayer/socket";

export function ChatPanel() {
  const chat = useNet((s) => s.chat);
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat.length]);
  return (
    <section data-ui className={`chat bw-chat${collapsed ? " is-collapsed" : ""}`} aria-label="Trò chuyện gần đây">
      <header className="bw-social-panel-heading"><strong>Trò chuyện gần đây</strong><button type="button" className="ghost" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "Mở" : "Thu gọn"}</button></header>
      {!collapsed && <><div className="chat-log" aria-live="polite">
        {chat.map((m) => (
          // React escape văn bản → không có XSS; không dùng innerHTML.
          <p key={m.id}><b>{m.from}</b> {m.text}</p>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { sendChat(text.trim()); setText(""); } }}>
        <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Nhắn cho người ở gần…" aria-label="Tin nhắn" />
      </form></>}
    </section>
  );
}
