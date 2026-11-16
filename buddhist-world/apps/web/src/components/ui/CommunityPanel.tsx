import { useCallback, useEffect, useState } from "react";
import { SOCKET_EVENTS as E, type CommunityPurpose, type CommunityVisibility } from "@bw/shared";
import { api } from "../../services/api";
import { getSocket } from "../../game/multiplayer/socket";

type Community = {
  id: string; name: string; slug: string; description: string; purpose: CommunityPurpose;
  visibility: CommunityVisibility; status: string; member_count: number; role?: string;
  my_role?: "owner" | "moderator" | "member" | null; my_membership_status?: string | null;
};
type Member = { user_id: string; username: string; role: string; joined_at: string };
type JoinRequest = { id: string; user_id: string; username: string; created_at: string };

const PURPOSE_LABELS: Record<CommunityPurpose, string> = {
  meditation: "Thiền tập",
  dharma_learning: "Học hỏi Phật pháp",
  temple_volunteering: "Phụng sự chùa",
  regional_community: "Cộng đồng khu vực",
  general: "Sinh hoạt chung",
};

function toSlug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function CommunityPanel({ onClose }: { onClose: () => void }) {
  const [mine, setMine] = useState<Community[]>([]);
  const [publicCommunities, setPublicCommunities] = useState<Community[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState<CommunityPurpose>("meditation");
  const [visibility, setVisibility] = useState<CommunityVisibility>("public");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const loadOverview = useCallback(async () => {
    const [mineResult, publicResult] = await Promise.all([
      api<{ communities: Community[] }>("/communities/mine"),
      api<{ communities: Community[] }>("/communities?limit=30"),
    ]);
    setMine(mineResult.communities);
    setPublicCommunities(publicResult.communities);
    if (!selectedId && mineResult.communities[0]) setSelectedId(mineResult.communities[0].id);
  }, [selectedId]);

  const loadDetail = useCallback(async (groupId: string) => {
    const result = await api<{ community: Community; members: Member[] }>(`/communities/${groupId}`);
    setCommunity(result.community);
    setMembers(result.members);
    if (result.community.my_role === "owner" || result.community.my_role === "moderator") {
      const pending = await api<{ requests: JoinRequest[] }>(`/communities/${groupId}/requests`);
      setRequests(pending.requests);
    } else setRequests([]);
  }, []);

  useEffect(() => {
    void loadOverview().catch((reason) => setError(reason instanceof Error ? reason.message : "Không thể tải cộng đồng."));
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedId) { setCommunity(null); setMembers([]); setRequests([]); return; }
    void loadDetail(selectedId).catch((reason) => {
      setCommunity(null); setMembers([]); setRequests([]);
      setError(reason instanceof Error ? reason.message : "Không thể tải chi tiết cộng đồng.");
    });
  }, [selectedId, loadDetail]);

  useEffect(() => {
    let attached: ReturnType<typeof getSocket> = null;
    const refresh = (event?: { groupId?: string }) => {
      void loadOverview().catch(() => {});
      if (!event?.groupId || event.groupId === selectedId) {
        if (selectedId) void loadDetail(selectedId).catch(() => {});
      }
    };
    const attach = () => {
      const socket = getSocket();
      if (!socket || socket === attached) return;
      attached = socket;
      socket.on(E.serverCommunityUpdated, refresh);
      socket.on(E.serverNotification, refresh);
    };
    attach();
    const retry = window.setInterval(attach, 200);
    return () => {
      window.clearInterval(retry);
      attached?.off(E.serverCommunityUpdated, refresh);
      attached?.off(E.serverNotification, refresh);
    };
  }, [loadDetail, loadOverview, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const perform = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(""); setNotice("");
    try { await action(); setNotice(success); await loadOverview(); if (selectedId) await loadDetail(selectedId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể thực hiện thao tác."); }
    finally { setBusy(""); }
  };

  const createCommunity = () => perform("create", async () => {
    const result = await api<{ community: Community }>("/communities", {
      method: "POST",
      body: JSON.stringify({ name, slug: slug || toSlug(name), description, purpose, visibility }),
    });
    setSelectedId(result.community.id);
    setName(""); setSlug(""); setDescription("");
  }, "Đã tạo cộng đồng.");

  const joinCommunity = (groupId: string) => perform(`join-${groupId}`, async () => {
    const result = await api<{ status: string }>(`/communities/${groupId}/join`, { method: "POST" });
    setNotice(result.status === "request_pending" ? "Đã gửi yêu cầu tham gia, chờ quản trị viên duyệt." : "Bạn đã tham gia cộng đồng.");
    setSelectedId(groupId);
  }, "Đã cập nhật yêu cầu tham gia.");

  const leaveCommunity = () => community && perform("leave", () => api(`/communities/${community.id}/leave`, { method: "POST" }), "Đã rời cộng đồng.");

  const reviewRequest = (requestId: string, decision: "approve" | "decline") => community && perform(
    `review-${requestId}`,
    () => api(`/communities/${community.id}/requests/${requestId}/review`, {
      method: "POST", body: JSON.stringify({ decision }),
    }),
    decision === "approve" ? "Đã duyệt thành viên." : "Đã từ chối yêu cầu.",
  );

  return <div className="profile-backdrop bw-community-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="profile-panel bw-community-panel" role="dialog" aria-modal="true" aria-labelledby="community-panel-title">
      <header className="profile-panel-header">
        <div><span className="bw-hud-eyebrow">CỘNG ĐỒNG TRONG THẾ GIỚI</span><h2 id="community-panel-title">Cộng đồng</h2></div>
        <button type="button" className="ghost" onClick={onClose} disabled={Boolean(busy)}>Đóng</button>
      </header>
      {error && <p className="bw-panel-message is-error" role="alert">{error}</p>}
      {notice && <p className="bw-panel-message" role="status">{notice}</p>}
      <div className="bw-community-layout">
        <aside className="bw-community-sidebar">
          <section className="bw-party-section">
            <h3>Cộng đồng của tôi</h3>
            {mine.map((item) => <button type="button" key={item.id} className={selectedId === item.id ? "bw-community-list-item is-active" : "bw-community-list-item"} onClick={() => setSelectedId(item.id)}>
              <strong>{item.name}</strong><small>{PURPOSE_LABELS[item.purpose]} · {item.member_count} thành viên</small>
            </button>)}
            {mine.length === 0 && <small className="bw-panel-empty">Bạn chưa tham gia cộng đồng nào.</small>}
          </section>
          <section className="bw-party-section">
            <h3>Khám phá</h3>
            {publicCommunities.map((item) => <button type="button" key={item.id} className={selectedId === item.id ? "bw-community-list-item is-active" : "bw-community-list-item"} onClick={() => setSelectedId(item.id)}>
              <strong>{item.name}</strong><small>{PURPOSE_LABELS[item.purpose]} · {item.member_count} thành viên</small>
            </button>)}
            {publicCommunities.length === 0 && <small className="bw-panel-empty">Chưa có cộng đồng công khai.</small>}
          </section>
        </aside>
        <main className="bw-community-content">
          {community ? <>
            <div className="bw-community-detail-heading">
              <div><strong>{community.name}</strong><small>{PURPOSE_LABELS[community.purpose]} · {community.visibility === "private" ? "Riêng tư" : "Công khai"} · {community.member_count} thành viên</small></div>
              <span>{community.my_role === "owner" ? "Chủ sở hữu" : community.my_role === "moderator" ? "Điều phối" : community.my_membership_status === "active" ? "Thành viên" : "Khách"}</span>
            </div>
            <p className="bw-community-description">{community.description || "Cộng đồng cùng học hỏi và sinh hoạt trong Buddhist World."}</p>
            {community.my_membership_status === "active" ? <>
              <div className="bw-community-members">
                <strong>Thành viên</strong>
                {members.map((member) => <span key={member.user_id}>{member.username}{member.role !== "member" ? ` · ${member.role === "owner" ? "Chủ sở hữu" : "Điều phối"}` : ""}</span>)}
              </div>
              {community.my_role !== "owner" && <button type="button" className="ghost" onClick={() => void leaveCommunity()} disabled={Boolean(busy)}>Rời cộng đồng</button>}
              {(community.my_role === "owner" || community.my_role === "moderator") && <section className="bw-community-requests">
                <strong>Yêu cầu tham gia</strong>
                {requests.map((request) => <div className="bw-community-request" key={request.id}>
                  <span>{request.username}</span>
                  <div><button type="button" onClick={() => void reviewRequest(request.id, "approve")} disabled={Boolean(busy)}>Duyệt</button>
                    <button type="button" className="ghost" onClick={() => void reviewRequest(request.id, "decline")} disabled={Boolean(busy)}>Từ chối</button></div>
                </div>)}
                {requests.length === 0 && <small>Không có yêu cầu đang chờ.</small>}
              </section>}
            </> : <button type="button" onClick={() => void joinCommunity(community.id)} disabled={Boolean(busy)}>
              {community.visibility === "private" ? "Gửi yêu cầu tham gia" : "Tham gia cộng đồng"}
            </button>}
          </> : <p className="bw-panel-empty">Chọn một cộng đồng để xem thông tin.</p>}
        </main>
      </div>
      <section className="bw-community-create">
        <h3>Tạo cộng đồng</h3>
        <div className="bw-community-create-grid">
          <label>Tên cộng đồng<input value={name} maxLength={80} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(toSlug(event.target.value)); }}/></label>
          <label>Đường dẫn<input value={slug} maxLength={80} onChange={(event) => setSlug(toSlug(event.target.value))}/></label>
          <label>Mục đích<select value={purpose} onChange={(event) => setPurpose(event.target.value as CommunityPurpose)}>
            {Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Quyền riêng tư<select value={visibility} onChange={(event) => setVisibility(event.target.value as CommunityVisibility)}>
            <option value="public">Công khai</option><option value="private">Riêng tư</option>
          </select></label>
        </div>
        <label className="bw-community-description-field">Mô tả<textarea value={description} maxLength={2000} rows={2} onChange={(event) => setDescription(event.target.value)}/></label>
        <button type="button" onClick={() => void createCommunity()} disabled={Boolean(busy) || name.trim().length < 3 || slug.length < 3}>Tạo cộng đồng</button>
      </section>
      <footer className="bw-party-footer">Cộng đồng là nhóm sinh hoạt lâu dài; Party là nhóm hoạt động tạm thời trong thế giới.</footer>
    </section>
  </div>;
}
