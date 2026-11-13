import { REGIONS } from "@bw/shared";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../../services/api";
import { useAuth } from "../../stores/auth";

interface PlayerProfile {
  id: string;
  username: string;
  display_name: string;
  base_model: string;
  character_config: Record<string, unknown>;
  region_id: string;
  spawn_id: string;
  x: number;
  y: number;
  z: number;
}

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const user = useAuth((s) => s.user);
  const setDisplayName = useAuth((s) => s.setDisplayName);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [displayName, setName] = useState(user?.displayName ?? user?.username ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const region = profile ? REGIONS[profile.region_id] : undefined;
  const savedSpawn = region?.spawns.find((spawn) => spawn.id === profile?.spawn_id);

  useEffect(() => {
    let active = true;
    api<PlayerProfile>("/me")
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setName(data.display_name);
        setDisplayName(data.display_name);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Không tải được hồ sơ.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [setDisplayName]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0]!; const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const result = await api<{ displayName: string }>("/me/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName }),
      });
      setName(result.displayName);
      setDisplayName(result.displayName);
      setProfile((current) => current ? { ...current, display_name: result.displayName } : current);
      setSuccess("Đã lưu hồ sơ.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Không thể lưu hồ sơ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-backdrop" data-ui onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="profile-heading">
          <div><span className="profile-kicker">HỒ SƠ NGƯỜI CHƠI</span><h2 id="profile-title">Thông tin của bạn</h2></div>
          <button className="ghost" type="button" aria-label="Đóng hồ sơ" onClick={onClose}>Đóng</button>
        </header>
        {loading ? <p className="muted">Đang tải hồ sơ…</p> : (
          <>
            <div className="profile-identity">
              <div className="profile-avatar" aria-hidden="true">{(displayName || user?.username || "P").slice(0, 1).toUpperCase()}</div>
              <div><strong>{displayName || user?.username}</strong><span className="muted">@{profile?.username ?? user?.username}</span></div>
            </div>
            <form className="profile-form" onSubmit={save}>
              <label htmlFor="profile-display-name">Tên hiển thị</label>
              <input id="profile-display-name" value={displayName} minLength={2} maxLength={32}
                onChange={(e) => setName(e.target.value)} required autoComplete="nickname" />
              <p className="muted">Tên từ 2–32 ký tự; hỗ trợ tiếng Việt, chữ, số, dấu cách, dấu gạch và dấu nháy.</p>
              {error && <p className="error" role="alert">{error}</p>}
              {success && <p className="profile-success" role="status">{success}</p>}
              <button type="submit" disabled={saving || displayName.trim() === (profile?.display_name ?? "")}>
                {saving ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </form>
            <div className="profile-details">
              <div><span>Nhân vật</span><strong>{profile?.base_model ?? "Mặc định"}</strong></div>
              <div><span>Khu vực</span><strong>{region?.name ?? profile?.region_id ?? "Chưa xác định"}</strong></div>
              <div><span>Điểm đã lưu</span><strong>{savedSpawn?.name ?? profile?.spawn_id ?? "Chưa có"}</strong></div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
