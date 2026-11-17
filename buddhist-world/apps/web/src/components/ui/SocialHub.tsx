import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../stores/auth";
import { useNet } from "../../stores/net";

export type SocialHubTab = "party" | "community" | "moderation";
interface Friend { id: string; username: string; display_name: string | null }
interface PlayerSearchResult { id: string; username: string; display_name: string | null }
interface PartyMember { id: string; username: string; display_name: string | null; role: string }
interface Party { id: string; region_id: string; leader_user_id: string; role: string; members: PartyMember[] }
interface SocialEvent { id: string; title: string; description: string; region_id: string; starts_at: string; ends_at: string; capacity: number; participant_count: number; host_username: string; joined: boolean }
interface Report { id: string; target_type: string; target_id: string; target_user_id: string | null; reason: string; details: string; status: string; reporter_username: string }

export function SocialHub({ initialTab, onClose }: { initialTab: SocialHubTab; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const user = useAuth((state) => state.user);
  const regionId = useNet((state) => state.regionId) ?? "temple_complex";
  const [tab, setTab] = useState<SocialHubTab>(initialTab);
  const [friends, setFriends] = useState<{
    friends: Friend[];
    sentRequests: Array<{id:string;recipient_id:string;username:string;display_name:string|null}>;
    receivedRequests: Array<{id:string;requester_id:string;username:string;display_name:string|null}>;
    blocks: Array<{blocked_id:string}>;
  }>({friends:[],sentRequests:[],receivedRequests:[],blocks:[]});
  const [party, setParty] = useState<Party | null>(null);
  const [messages, setMessages] = useState<Array<{id:number;username:string;body:string;created_at:string}>>([]);
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportFilter, setReportFilter] = useState<"open" | "reviewing" | "all">("open");
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([]);
  const [partyId, setPartyId] = useState("");
  const [chatText, setChatText] = useState("");
  const [reportUserId, setReportUserId] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isModerator = user?.role === "moderator" || user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [friendData, partyData, eventData] = await Promise.all([
        api<typeof friends>("/social/friends"),
        api<{party:Party|null}>("/social/party"),
        api<{events:SocialEvent[]}>("/social/events"),
      ]);
      setFriends(friendData); setParty(partyData.party); setEvents(eventData.events);
      if (partyData.party) {
        const messageData = await api<{messages:Array<{id:number;username:string;body:string;created_at:string}>}>(`/social/party/${partyData.party.id}/messages`);
        setMessages(messageData.messages);
      } else setMessages([]);
      if (isModerator) {
        const reportData = await api<{reports:Report[]}>(`/social/moderation/reports?status=${reportFilter}`);
        setReports(reportData.reports);
      } else setReports([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu cộng đồng.");
    } finally { setLoading(false); }
  }, [isModerator, reportFilter]);

  useEffect(() => { void load(); }, [load, tab]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled)")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);

  async function action(task: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await task(); setNotice(success); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hoàn thành thao tác."); }
    finally { setBusy(false); }
  }
  async function searchPlayers(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    try {
      const result = await api<{players:PlayerSearchResult[]}>(`/social/players?q=${encodeURIComponent(playerQuery.trim())}`);
      setPlayerResults(result.players);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tìm được người chơi."); }
  }
  async function reportPlayer(event: React.FormEvent) {
    event.preventDefault();
    await action(() => api("/social/reports",{method:"POST",body:JSON.stringify({
      targetType:"user",targetId:reportUserId,targetUserId:reportUserId,reason:reportReason,
    })}),"Đã gửi báo cáo tới đội ngũ kiểm duyệt.");
    setReportUserId("");setReportReason("");
  }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); if (!party || !chatText.trim()) return;
    await action(() => api(`/social/party/${party.id}/messages`, {method:"POST",body:JSON.stringify({text:chatText})}), "Đã gửi tin nhắn.");
    setChatText("");
  }
  async function createEvent(event: React.FormEvent) {
    event.preventDefault();
    await action(() => api("/social/events", {method:"POST",body:JSON.stringify({
      title:eventTitle,description:eventDescription,regionId,startsAt:new Date(eventStart).toISOString(),
      endsAt:new Date(eventEnd).toISOString(),capacity:32,
    })}), "Đã tạo sự kiện cộng đồng.");
    setEventTitle(""); setEventDescription(""); setEventStart(""); setEventEnd("");
  }

  return <div className="profile-backdrop" data-ui onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="profile-panel bw-social-panel" role="dialog" aria-modal="true" aria-labelledby="social-hub-title">
      <header className="profile-heading">
        <div><span className="profile-kicker">BUDDHIST WORLD · SOCIAL</span><h2 id="social-hub-title">Không gian cộng đồng</h2></div>
        <button className="ghost" onClick={onClose} aria-label="Đóng cộng đồng">Đóng</button>
      </header>
      <nav className="bw-social-tabs" aria-label="Khu vực cộng đồng">
        <button aria-pressed={tab==="party"} onClick={()=>setTab("party")}>Party & Bạn bè</button>
        <button aria-pressed={tab==="community"} onClick={()=>setTab("community")}>Sự kiện</button>
        {isModerator && <button aria-pressed={tab==="moderation"} onClick={()=>setTab("moderation")}>Kiểm duyệt</button>}
      </nav>
      {loading ? <p className="muted">Đang đồng bộ cộng đồng…</p> : <>
        {tab==="party" && <div className="bw-social-content">
          <section className="bw-social-card">
            <h3>Party</h3>
            {party ? <>
              <p className="muted">Khu vực: {party.region_id} · {party.members.length}/8 thành viên</p>
              <ul className="bw-social-list">{party.members.map(member=><li key={member.id}><span>{member.display_name || member.username}</span><small>{member.role==="leader"?"Trưởng nhóm":"Thành viên"}</small></li>)}</ul>
              <button disabled={busy} onClick={()=>void action(()=>api("/social/party/leave",{method:"POST"}),"Đã rời party.")}>Rời party</button>
              <h4>Trò chuyện nhóm</h4>
              <div className="bw-social-messages" aria-live="polite">{messages.map(message=><p key={message.id}><strong>{message.username}</strong> {message.body}</p>)}</div>
              <form onSubmit={sendMessage}><input value={chatText} onChange={e=>setChatText(e.target.value)} maxLength={1200} placeholder="Nhắn trong party…" /><button disabled={busy||!chatText.trim()}>Gửi</button></form>
            </> : <>
              <p className="muted">Bạn chưa ở trong party nào.</p>
              <button disabled={busy} onClick={()=>void action(()=>api("/social/party",{method:"POST",body:JSON.stringify({regionId})}),"Đã tạo party.")}>Tạo party tại khu vực hiện tại</button>
              <form onSubmit={event=>{event.preventDefault();void action(()=>api(`/social/party/${encodeURIComponent(partyId.trim())}/join`,{method:"POST"}),"Đã tham gia party.");}}>
                <input value={partyId} onChange={e=>setPartyId(e.target.value)} placeholder="ID party để tham gia" />
                <button disabled={busy||!partyId.trim()}>Tham gia</button>
              </form>
            </>}
          </section>
          <section className="bw-social-card">
            <h3>Bạn bè</h3>
            <form onSubmit={searchPlayers}><input value={playerQuery} onChange={e=>setPlayerQuery(e.target.value)} placeholder="Tìm theo tên người chơi" /><button disabled={busy||playerQuery.trim().length<2}>Tìm</button></form>
            {playerResults.map(player=><div className="bw-social-request" key={player.id}><span>{player.display_name||player.username} <small>@{player.username}</small></span><button disabled={busy} onClick={()=>void action(()=>api(`/social/friends/requests/${player.id}`,{method:"POST"}),"Đã gửi lời mời kết bạn.")}>Kết bạn</button><button className="ghost" onClick={()=>{setReportUserId(player.id);setReportReason("Hành vi cần được xem xét");}}>Báo cáo</button></div>)}
            <ul className="bw-social-list">{friends.friends.map(friend=><li key={friend.id}><span>{friend.display_name||friend.username}</span><button className="ghost" onClick={()=>void action(()=>api(`/social/blocks/${friend.id}`,{method:"POST"}),"Đã chặn người chơi.")}>Chặn</button></li>)}</ul>
            {friends.receivedRequests.map(request=><div className="bw-social-request" key={request.id}><span>Lời mời từ {request.display_name||request.username}</span><button disabled={busy} onClick={()=>void action(()=>api(`/social/friends/requests/${request.id}/respond`,{method:"POST",body:JSON.stringify({decision:"accept"})}),"Đã chấp nhận lời mời.")}>Chấp nhận</button><button className="ghost" disabled={busy} onClick={()=>void action(()=>api(`/social/friends/requests/${request.id}/respond`,{method:"POST",body:JSON.stringify({decision:"decline"})}),"Đã từ chối lời mời.")}>Từ chối</button></div>)}
            {friends.blocks.map(block=><div className="bw-social-request" key={block.blocked_id}><span>Đã chặn {block.blocked_id.slice(0,8)}…</span><button className="ghost" disabled={busy} onClick={()=>void action(()=>api(`/social/blocks/${block.blocked_id}`,{method:"DELETE"}),"Đã bỏ chặn.")}>Bỏ chặn</button></div>)}
            {reportUserId && <form onSubmit={reportPlayer}><p className="muted">Báo cáo người chơi {reportUserId.slice(0,8)}…</p><input value={reportReason} onChange={e=>setReportReason(e.target.value)} placeholder="Lý do báo cáo" maxLength={200} required /><button disabled={busy}>Gửi báo cáo</button><button className="ghost" type="button" onClick={()=>setReportUserId("")}>Hủy</button></form>}
          </section>
        </div>}
        {tab==="community" && <div className="bw-social-content">
          <section className="bw-social-card"><h3>Sự kiện cộng đồng</h3>
            {events.length===0?<p className="muted">Chưa có sự kiện được công bố.</p>:events.map(event=><article className="bw-social-event" key={event.id}>
              <h4>{event.title}</h4><p>{event.description}</p><small>{event.region_id} · {new Date(event.starts_at).toLocaleString()} · {event.participant_count}/{event.capacity}</small>
              <button disabled={busy||event.joined} onClick={()=>void action(()=>api(`/social/events/${event.id}/join`,{method:"POST"}),"Đã đăng ký sự kiện.")}>{event.joined?"Đã tham gia":"Tham gia"}</button>
            </article>)}
          </section>
          {isModerator && <section className="bw-social-card"><h3>Tạo sự kiện</h3><form onSubmit={createEvent}>
            <label>Tên sự kiện<input value={eventTitle} onChange={e=>setEventTitle(e.target.value)} maxLength={160} required /></label>
            <label>Mô tả<textarea value={eventDescription} onChange={e=>setEventDescription(e.target.value)} maxLength={2000} /></label>
            <label>Bắt đầu<input type="datetime-local" value={eventStart} onChange={e=>setEventStart(e.target.value)} required /></label>
            <label>Kết thúc<input type="datetime-local" value={eventEnd} onChange={e=>setEventEnd(e.target.value)} required /></label>
            <button disabled={busy}>Công bố sự kiện</button>
          </form></section>}
        </div>}
        {tab==="moderation" && isModerator && <section className="bw-social-card"><h3>Hàng đợi báo cáo</h3><div className="bw-social-tabs" aria-label="Lọc báo cáo"><button aria-pressed={reportFilter==="open"} onClick={()=>setReportFilter("open")}>Mới</button><button aria-pressed={reportFilter==="reviewing"} onClick={()=>setReportFilter("reviewing")}>Đang xử lý</button><button aria-pressed={reportFilter==="all"} onClick={()=>setReportFilter("all")}>Tất cả</button></div>
          {reports.length===0?<p className="muted">Không có báo cáo đang chờ.</p>:reports.map(report=><article className="bw-social-report" key={report.id}>
            <div><strong>{report.reason}</strong><small>{report.target_type} · {report.target_id} · bởi {report.reporter_username}</small><p>{report.details}</p></div>
            <div className="bw-social-report-actions">
              <button disabled={busy} onClick={()=>void action(()=>api(`/social/moderation/reports/${report.id}`,{method:"PATCH",body:JSON.stringify({status:"reviewing",resolution:"Đang xem xét"})}),"Đã nhận xử lý.")}>Đang xem xét</button>
              <button disabled={busy} onClick={()=>void action(()=>api(`/social/moderation/reports/${report.id}`,{method:"PATCH",body:JSON.stringify({status:"resolved",resolution:"Đã xử lý"})}),"Đã đóng báo cáo.")}>Đóng</button>
              <button className="ghost" disabled={busy} onClick={()=>void action(()=>api(`/social/moderation/reports/${report.id}`,{method:"PATCH",body:JSON.stringify({status:"dismissed",resolution:"Không vi phạm"})}),"Đã bỏ qua báo cáo.")}>Bỏ qua</button>
            </div>
          </article>)}
        </section>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="profile-success" role="status">{notice}</p>}
      <footer className="bw-social-footer"><span className="muted">Quyền thành viên và kiểm duyệt được xác minh ở máy chủ.</span><button className="ghost" onClick={()=>void load()}>Làm mới</button></footer>
    </section>
  </div>;
}
