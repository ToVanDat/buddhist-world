import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SOCKET_EVENTS as E } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useNet } from "../../stores/net";
import { getSocket, sendChat } from "../../game/multiplayer/socket";

type Member = { id: string; username: string; displayName?: string | null; role?: string };
type Conversation = {
  id: string;
  kind: "direct" | "group";
  title?: string | null;
  members?: Member[] | null;
  last_message?: { id: string; senderId: string; body: string | null; deleted: boolean; createdAt: string } | null;
  unread_count: number;
};
type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  username?: string | null;
  body: string | null;
  deleted?: boolean;
  created_at: string;
};
type Friend = { id: string; username: string; display_name?: string | null };

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Không thể tải dữ liệu trò chuyện.");
  return data;
}

export function ChatPanel() {
  const chat = useNet((s) => s.chat);
  const userId = useAuth((s) => s.user?.id);
  const accessToken = useAuth((s) => s.accessToken);
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<"nearby" | "inbox">("nearby");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const loadConversations = useCallback(async () => {
    if (!accessToken) return;
    const data = await api<{ conversations: Conversation[] }>(accessToken, "/api/chat/conversations?limit=50");
    setConversations(data.conversations);
  }, [accessToken]);

  const loadFriends = useCallback(async () => {
    if (!accessToken) return;
    const data = await api<{ friends: Friend[] }>(accessToken, "/api/social/friends?limit=100");
    setFriends(data.friends);
  }, [accessToken]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!accessToken) return;
    const data = await api<{ messages: Message[] }>(accessToken, `/api/chat/conversations/${conversationId}/messages?limit=50`);
    setMessages(data.messages);
    await api(accessToken, `/api/chat/conversations/${conversationId}/read`, { method: "POST" });
    setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, unread_count: 0 } : item));
  }, [accessToken]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat.length, messages.length]);

  useEffect(() => {
    if (view !== "inbox" || !accessToken) return;
    setLoading(true);
    setError("");
    void Promise.all([loadConversations(), loadFriends()])
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Không thể tải hộp thư."))
      .finally(() => setLoading(false));
  }, [view, accessToken, loadConversations, loadFriends]);

  useEffect(() => {
    if (view !== "inbox" || !selectedId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setError("");
    void loadMessages(selectedId)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Không thể tải tin nhắn."))
      .finally(() => setLoading(false));
  }, [view, selectedId, loadMessages]);

  useEffect(() => {
    if (!accessToken) return;
    let attached: ReturnType<typeof getSocket> = null;
    const onMessage = (event: Message) => {
      if (event.conversation_id === selectedIdRef.current) {
        setMessages((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
        void api(accessToken, `/api/chat/conversations/${event.conversation_id}/read`, { method: "POST" }).catch(() => {});
      }
      void loadConversations().catch(() => {});
    };
    const onConversationCreated = () => { void loadConversations().catch(() => {}); };
    const onDeleted = (event: { conversationId: string; messageId: string }) => {
      if (event.conversationId !== selectedIdRef.current) return;
      setMessages((current) => current.map((item) => item.id === event.messageId ? { ...item, body: null, deleted: true } : item));
    };
    const onNotification = () => {
      if (view === "inbox") void loadConversations().catch(() => {});
    };
    const attach = () => {
      const socket = getSocket();
      if (!socket || socket === attached) return;
      attached = socket;
      socket.on(E.serverConversationMessage, onMessage);
      socket.on(E.serverConversationCreated, onConversationCreated);
      socket.on(E.serverConversationDeleted, onDeleted);
      socket.on(E.serverNotification, onNotification);
    };
    attach();
    const retry = window.setInterval(attach, 200);
    return () => {
      window.clearInterval(retry);
      attached?.off(E.serverConversationMessage, onMessage);
      attached?.off(E.serverConversationCreated, onConversationCreated);
      attached?.off(E.serverConversationDeleted, onDeleted);
      attached?.off(E.serverNotification, onNotification);
    };
  }, [accessToken, loadConversations, view]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const openDirect = async (friendId: string) => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const result = await api<{ conversationId: string }>(accessToken, "/api/chat/direct", {
        method: "POST", body: JSON.stringify({ userId: friendId }),
      });
      await loadConversations();
      setSelectedId(result.conversationId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể mở hội thoại.");
    } finally { setLoading(false); }
  };

  const sendDirectMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !selectedId || !text.trim()) return;
    const body = text.trim();
    setText("");
    try {
      const saved = await api<Message>(accessToken, `/api/chat/conversations/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, clientMessageId: crypto.randomUUID() }),
      });
      setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      await loadConversations();
    } catch (reason) {
      setText(body);
      setError(reason instanceof Error ? reason.message : "Không thể gửi tin nhắn.");
    }
  };

  const conversationName = (conversation: Conversation) => {
    if (conversation.kind === "group") return conversation.title || "Nhóm người chơi";
    const peer = conversation.members?.find((member) => member.id !== userId);
    return peer?.displayName || peer?.username || "Hội thoại riêng";
  };

  return (
    <section data-ui className={`chat bw-chat${collapsed ? " is-collapsed" : ""}`} aria-label="Trò chuyện trong thế giới">
      <header className="bw-social-panel-heading">
        <strong>{view === "nearby" ? "Trò chuyện gần đây" : selectedConversation ? conversationName(selectedConversation) : "Hộp thư"}</strong>
        <div className="bw-chat-heading-actions">
          {view === "inbox" && selectedId && <button type="button" className="ghost" onClick={() => setSelectedId(null)}>Quay lại</button>}
          <button type="button" className="ghost" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "Mở" : "Thu gọn"}</button>
        </div>
      </header>
      {!collapsed && <>
        <nav className="bw-chat-tabs" aria-label="Chế độ trò chuyện">
          <button type="button" className={view === "nearby" ? "is-active" : ""} onClick={() => { setView("nearby"); setSelectedId(null); }}>Gần bạn</button>
          <button type="button" className={view === "inbox" ? "is-active" : ""} onClick={() => setView("inbox")}>Hộp thư</button>
        </nav>
        {view === "nearby" ? <>
          <div className="chat-log" aria-live="polite">
            {chat.map((m) => <p key={m.id}><b>{m.from}</b> {m.text}</p>)}
            <div ref={end} />
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (text.trim()) { sendChat(text.trim()); setText(""); } }}>
            <input value={text} maxLength={200} onChange={(event) => setText(event.target.value)} placeholder="Nhắn cho người ở gần…" aria-label="Tin nhắn gần đây" />
          </form>
        </> : <>
          {error && <p className="voice-status" role="alert">{error}</p>}
          {loading && <p className="voice-status">Đang tải…</p>}
          {selectedConversation ? <>
            <div className="chat-log bw-inbox-messages" aria-live="polite">
              {messages.map((message) => <p key={message.id} className={message.sender_id === userId ? "is-own-message" : ""}>
                <b>{message.sender_id === userId ? "Bạn" : message.username || "Người chơi"}</b>{" "}
                {message.deleted || !message.body ? <i>Tin nhắn đã được thu hồi</i> : message.body}
              </p>)}
              <div ref={end} />
            </div>
            <form onSubmit={(event) => void sendDirectMessage(event)}>
              <input value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} placeholder="Nhập tin nhắn…" aria-label="Tin nhắn riêng" disabled={loading}/>
              <button type="submit" disabled={!text.trim() || loading}>Gửi</button>
            </form>
          </> : <>
            <div className="bw-inbox-list" aria-label="Các cuộc trò chuyện">
              {conversations.map((conversation) => <button type="button" key={conversation.id} className="bw-inbox-item" onClick={() => setSelectedId(conversation.id)}>
                <span><b>{conversationName(conversation)}</b><small>{conversation.last_message?.body ?? "Chưa có tin nhắn"}</small></span>
                {conversation.unread_count > 0 && <i>{conversation.unread_count}</i>}
              </button>)}
              {conversations.length === 0 && !loading && <p className="voice-status">Chưa có hội thoại. Chọn một người bạn để bắt đầu.</p>}
            </div>
            <div className="bw-inbox-friends" aria-label="Bạn bè">
              <strong>Bạn bè</strong>
              {friends.map((friend) => <div className="bw-inbox-friend" key={friend.id}>
                <span>{friend.display_name || friend.username}</span>
                <button type="button" onClick={() => void openDirect(friend.id)} disabled={loading}>Nhắn tin</button>
              </div>)}
              {friends.length === 0 && <small>Chưa có bạn bè. Hãy kết bạn trong thế giới.</small>}
            </div>
          </>}
        </>}
      </>}
    </section>
  );
}
