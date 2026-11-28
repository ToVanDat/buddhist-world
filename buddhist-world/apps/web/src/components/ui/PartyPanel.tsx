import { useCallback, useEffect, useState } from "react";
import { SOCKET_EVENTS as E, type PartyActivityType } from "@bw/shared";
import { api } from "../../services/api";
import { useNet } from "../../stores/net";
import { getSocket } from "../../game/multiplayer/socket";

type PartyMember = { userId: string; username: string; role: "leader" | "member"; joinedAt: string };
type Party = {
  id: string; leader_id: string; activity_type: PartyActivityType; region_id: string;
  status: "open" | "in_activity" | "closed"; max_members: number; member_count: number;
  role?: "leader" | "member"; members?: PartyMember[];
};
type Invite = { id: string; party_id: string; inviter_username: string; activity_type: PartyActivityType; region_id: string; created_at: string };
type Friend = { id: string; username: string; display_name?: string | null };

const ACTIVITY_LABELS: Record<PartyActivityType, string> = {
  meditation: "Thiền tập",
  dharma_talk: "Pháp thoại",
  ceremony: "Nghi lễ",
  guided_tour: "Tham quan có hướng dẫn",
  world_visit: "Thăm thế giới",
};

export function PartyPanel({ onClose }: { onClose: () => void }) {
  const regionId = useNet((state) => state.regionId);
  const [party, setParty] = useState<Party | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activityType, setActivityType] = useState<PartyActivityType>("guided_tour");
  const [maxMembers, setMaxMembers] = useState(6);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const query = regionId ? `?regionId=${encodeURIComponent(regionId)}&limit=30` : "?limit=30";
    const [mine, open, inbox, friendList] = await Promise.all([
      api<{ parties: Party[] }>("/parties/mine"),
      api<{ parties: Party[] }>(`/parties${query}`),
      api<{ invites: Invite[] }>("/parties/invites/inbox"),
      api<{ friends: Friend[] }>("/social/friends?limit=100"),
    ]);
    setParties(open.parties);
    setInvites(inbox.invites);
    setFriends(friendList.friends);
    const current = mine.parties[0] ?? null;
    if (current) {
      const details = await api<{ party: Party }>(`/parties/${current.id}`);
      setParty({ ...details.party, role: current.role });
    } else setParty(null);
  }, [regionId]);

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Không thể tải nhóm tham quan."));
  }, [load]);

  useEffect(() => {
    let attached: ReturnType<typeof getSocket> = null;
    const refresh = () => { void load().catch(() => {}); };
    const attach = () => {
      const socket = getSocket();
      if (!socket || socket === attached) return;
      attached = socket;
      socket.on(E.serverPartyUpdated, refresh);
      socket.on(E.serverPartyInvite, refresh);
      socket.on(E.serverNotification, refresh);
    };
    attach();
    const retry = window.setInterval(attach, 200);
    return () => {
      window.clearInterval(retry);
      attached?.off(E.serverPartyUpdated, refresh);
      attached?.off(E.serverPartyInvite, refresh);
      attached?.off(E.serverNotification, refresh);
    };
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const perform = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể thực hiện thao tác.");
    } finally { setBusy(""); }
  };

  const createParty = () => perform("create", () => api("/parties", {
    method: "POST", body: JSON.stringify({ activityType, regionId, maxMembers }),
  }), "Đã tạo nhóm tham quan.");

  const joinParty = (partyId: string) => perform(`join-${partyId}`, () => api(`/parties/${partyId}/join`, { method: "POST" }), "Đã tham gia nhóm tham quan.");

  const respondInvite = (inviteId: string, action: "accept" | "decline") => perform(
    `invite-${inviteId}`,
    () => api(`/parties/invites/${inviteId}/respond`, { method: "POST", body: JSON.stringify({ action }) }),
    action === "accept" ? "Đã tham gia nhóm tham quan." : "Đã từ chối lời mời.",
  );

  const inviteFriend = (friendId: string) => {
    if (!party) return;
    return perform(`friend-${friendId}`, () => api(`/parties/${party.id}/invites`, {
      method: "POST", body: JSON.stringify({ userId: friendId }),
    }), "Đã gửi lời mời.");
  };

  const leaveParty = () => party && perform("leave", () => api(`/parties/${party.id}/leave`, { method: "POST" }), "Đã rời nhóm tham quan.");
  const closeParty = () => party && perform("close", () => api(`/parties/${party.id}/close`, { method: "POST" }), "Đã đóng nhóm tham quan.");

  return <div className="profile-backdrop bw-party-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="profile-panel bw-party-panel" role="dialog" aria-modal="true" aria-labelledby="party-panel-title">
      <header className="profile-panel-header">
        <div><span className="bw-hud-eyebrow">THAM QUAN CÙNG NHAU</span><h2 id="party-panel-title">Cùng tham quan</h2></div>
        <button type="button" className="ghost" onClick={onClose} disabled={Boolean(busy)} aria-label="Đóng nhóm">Đóng</button>
      </header>
      {error && <p className="bw-panel-message is-error" role="alert">{error}</p>}
      {notice && <p className="bw-panel-message" role="status">{notice}</p>}

      {invites.length > 0 && <section className="bw-party-section">
        <h3>Lời mời đang chờ</h3>
        {invites.map((invite) => <article className="bw-party-card" key={invite.id}>
          <div><strong>{invite.inviter_username} mời bạn cùng tham quan</strong><small>{ACTIVITY_LABELS[invite.activity_type] ?? invite.activity_type}</small></div>
          <div className="bw-party-actions">
            <button type="button" onClick={() => void respondInvite(invite.id, "accept")} disabled={Boolean(busy)}>Tham gia</button>
            <button type="button" className="ghost" onClick={() => void respondInvite(invite.id, "decline")} disabled={Boolean(busy)}>Từ chối</button>
          </div>
        </article>)}
      </section>}

      {party ? <section className="bw-party-section">
        <h3>Nhóm tham quan hiện tại</h3>
        <article className="bw-party-card is-current">
          <div><strong>{ACTIVITY_LABELS[party.activity_type] ?? party.activity_type}</strong><small>{party.member_count}/{party.max_members} thành viên · {party.status === "in_activity" ? "Đang hoạt động" : "Đang mở"}</small></div>
          <div className="bw-party-members">
            {(party.members ?? []).map((member) => <span key={member.userId}>{member.username}{member.role === "leader" ? " · Trưởng nhóm" : ""}</span>)}
          </div>
          {party.role === "leader" && <div className="bw-party-invite">
            <strong>Mời bạn bè</strong>
            {friends.filter((friend) => !(party.members ?? []).some((member) => member.userId === friend.id)).map((friend) => <div className="bw-party-friend" key={friend.id}>
              <span>{friend.display_name || friend.username}</span>
              <button type="button" className="ghost" onClick={() => void inviteFriend(friend.id)} disabled={Boolean(busy)}>Mời</button>
            </div>)}
          </div>}
          <div className="bw-party-actions">
            <button type="button" className="ghost" onClick={() => void leaveParty()} disabled={Boolean(busy)}>Rời nhóm</button>
            {party.role === "leader" && <button type="button" className="danger" onClick={() => void closeParty()} disabled={Boolean(busy)}>Đóng nhóm</button>}
          </div>
        </article>
      </section> : <>
        <section className="bw-party-section">
          <h3>Tạo nhóm tham quan</h3>
          <div className="bw-party-create">
            <label>Hoạt động<select value={activityType} onChange={(event) => setActivityType(event.target.value as PartyActivityType)}>
              {Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select></label>
            <label>Số thành viên<select value={maxMembers} onChange={(event) => setMaxMembers(Number(event.target.value))}>
              {[2, 4, 6, 8, 12, 16].map((value) => <option value={value} key={value}>{value}</option>)}
            </select></label>
            <button type="button" onClick={() => void createParty()} disabled={Boolean(busy) || !regionId}>{busy === "create" ? "Đang tạo…" : "Tạo nhóm"}</button>
          </div>
        </section>
        <section className="bw-party-section">
          <h3>Nhóm đang tham quan</h3>
          {parties.map((item) => <article className="bw-party-card" key={item.id}>
            <div><strong>{ACTIVITY_LABELS[item.activity_type] ?? item.activity_type}</strong><small>{item.member_count}/{item.max_members} thành viên · {item.status === "in_activity" ? "Đang hoạt động" : "Đang mở"}</small></div>
            <button type="button" onClick={() => void joinParty(item.id)} disabled={Boolean(busy) || item.member_count >= item.max_members}>Tham gia</button>
          </article>)}
          {parties.length === 0 && <p className="bw-panel-empty">Chưa có nhóm công khai trong khu vực này.</p>}
        </section>
      </>}
      <footer className="bw-party-footer">Nhóm giúp bạn cùng khám phá khuôn viên. Trò chuyện thoại là tùy chọn và có thể tắt bất cứ lúc nào.</footer>
    </section>
  </div>;
}
