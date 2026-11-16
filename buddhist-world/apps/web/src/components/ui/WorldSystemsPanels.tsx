import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";

type CatalogItem = {
  id: string; category: string; slot: string; is_starter: boolean;
  asset_id: string; asset_key: string; name: string; description?: string;
  storage_key?: string; metadata?: Record<string, unknown>;
};
type Preset = { id: string; name: string; description?: string; config: Record<string, unknown>; base_model_key: string; base_model_storage_key?: string };
type CharacterConfig = { baseModelAssetId?: string; presetId?: string | null; itemIds?: string[]; colors?: Record<string, string> };

function PanelFrame({ title, eyebrow, onClose, children, wide = false }: {
  title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return <div className="profile-backdrop bw-feature-backdrop" data-ui onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className={`profile-panel bw-feature-panel${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="profile-panel-header">
        <div><span className="bw-hud-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        <button type="button" className="ghost" onClick={onClose}>Đóng</button>
      </header>
      {children}
    </section>
  </div>;
}

export function CharacterCreatorPanel({ onClose }: { onClose: () => void }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [baseModelAssetId, setBaseModelAssetId] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({ primary: "#b79b5b", secondary: "#647c67", accent: "#d7c9a5" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [itemsResult, presetsResult, characterResult] = await Promise.all([
      api<{ items: CatalogItem[] }>("/characters/catalog"),
      api<{ presets: Preset[] }>("/characters/presets"),
      api<{ character: { base_model_asset_id?: string; config?: CharacterConfig } }>("/characters/me").catch(() => null),
    ]);
    setCatalog(itemsResult.items);
    setPresets(presetsResult.presets);
    const config = characterResult?.character.config ?? {};
    const initialBase = characterResult?.character.base_model_asset_id ?? config.baseModelAssetId
      ?? itemsResult.items.find((item) => item.category === "body")?.asset_id ?? "";
    setBaseModelAssetId(initialBase);
    setPresetId(config.presetId ?? null);
    setItemIds(config.itemIds ?? []);
    setColors((current) => ({ ...current, ...(config.colors ?? {}) }));
  }, []);

  useEffect(() => {
    let active = true;
    void load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Không thể tải dữ liệu nhân vật."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const models = catalog.filter((item) => item.category === "body");
  const selectedModel = models.find((item) => item.asset_id === baseModelAssetId)
    ?? catalog.find((item) => item.asset_id === baseModelAssetId);
  const wearable = catalog.filter((item) => item.category !== "body");
  const toggleItem = (id: string) => setItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  const applyPreset = (preset: Preset) => {
    const modelId = typeof preset.config.baseModelAssetId === "string" ? preset.config.baseModelAssetId
      : catalog.find((item) => item.asset_key === preset.base_model_key)?.asset_id;
    if (!modelId) { setError("Preset chưa có model tương thích trong catalog đã phát hành."); return; }
    setBaseModelAssetId(modelId);
    setPresetId(preset.id);
    if (Array.isArray(preset.config.itemIds)) setItemIds(preset.config.itemIds.filter((id): id is string => typeof id === "string"));
    if (preset.config.colors && typeof preset.config.colors === "object") setColors((current) => ({ ...current, ...(preset.config.colors as Record<string, string>) }));
    setError("");
  };

  const save = async () => {
    if (!baseModelAssetId) { setError("Chưa có model nhân vật được phát hành để chọn."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await api("/characters/me", { method: "PUT", body: JSON.stringify({ baseModelAssetId, presetId, itemIds, colors }) });
      setNotice("Đã lưu diện mạo nhân vật.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu nhân vật."); }
    finally { setSaving(false); }
  };

  return <PanelFrame title="Character Creator" eyebrow="TẠO DỰNG NHÂN VẬT" onClose={onClose} wide>
    {loading ? <p className="muted">Đang tải Character Catalog…</p> : <>
      {error && <p className="bw-panel-message is-error" role="alert">{error}</p>}
      {notice && <p className="bw-panel-message" role="status">{notice}</p>}
      <div className="bw-creator-layout">
        <aside className="bw-creator-preview">
          <span className="bw-hud-eyebrow">BẢN XEM TRƯỚC</span>
          <div className="bw-creator-avatar" style={{ "--avatar-primary": colors.primary, "--avatar-secondary": colors.secondary, "--avatar-accent": colors.accent } as React.CSSProperties}>
            <div className="bw-creator-aura" /><div className="bw-creator-silhouette"><i /><b /><span /></div>
          </div>
          <strong>{selectedModel?.name ?? "Chưa chọn model"}</strong>
          <small>{selectedModel?.asset_key ?? "Chọn một model từ catalog"}</small>
          <div className="bw-creator-color-swatches">
            {Object.entries(colors).map(([key, value]) => <label key={key} title={key}><input type="color" value={value} aria-label={`Màu ${key}`} onChange={(event) => setColors((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          </div>
          <small>Khung xem trước màu và cấu hình. Model GLB sẽ được hiển thị trực tiếp khi asset URL được cung cấp bởi Asset Delivery.</small>
        </aside>
        <div className="bw-creator-controls">
          <section className="bw-feature-section">
            <h3>Preset nhân vật</h3>
            <div className="bw-preset-grid">
              {presets.map((preset) => <button type="button" key={preset.id} className={presetId === preset.id ? "bw-preset-card is-selected" : "bw-preset-card"} onClick={() => applyPreset(preset)}>
                <strong>{preset.name}</strong><small>{preset.description || "Preset đã được duyệt"}</small>
              </button>)}
              {presets.length === 0 && <p className="bw-feature-empty">Chưa có preset công khai được phát hành.</p>}
            </div>
          </section>
          <section className="bw-feature-section">
            <h3>Model cơ bản</h3>
            <div className="bw-option-grid">
              {models.map((item) => <button type="button" key={item.id} className={baseModelAssetId === item.asset_id ? "bw-option-card is-selected" : "bw-option-card"} onClick={() => { setBaseModelAssetId(item.asset_id); setPresetId(null); }}>
                <strong>{item.name}</strong><small>{item.slot} · {item.asset_key}</small>
              </button>)}
              {models.length === 0 && <p className="bw-feature-empty">Catalog chưa có model body được duyệt. Không tự tạo model giả.</p>}
            </div>
          </section>
          <section className="bw-feature-section">
            <h3>Trang phục và phụ kiện</h3>
            <div className="bw-option-grid">
              {wearable.map((item) => <label className={itemIds.includes(item.id) ? "bw-option-card is-selected" : "bw-option-card"} key={item.id}>
                <input type="checkbox" checked={itemIds.includes(item.id)} onChange={() => toggleItem(item.id)} />
                <span><strong>{item.name}</strong><small>{item.category} · {item.slot} · {item.is_starter ? "Cơ bản" : "Cần sở hữu"}</small></span>
              </label>)}
              {wearable.length === 0 && <p className="bw-feature-empty">Chưa có trang phục/phụ kiện được phát hành.</p>}
            </div>
          </section>
          <footer className="bw-feature-footer"><span>{itemIds.length} vật phẩm được chọn</span><button type="button" onClick={() => void save()} disabled={saving || !baseModelAssetId}>{saving ? "Đang lưu…" : "Lưu nhân vật"}</button></footer>
        </div>
      </div>
    </>}
  </PanelFrame>;
}

type ShopItem = { id: string; name: string; description: string; category: string; price: string | number; currency_code: string; stack_limit: number };
type Wallet = { currency_code: string; balance: string | number };
export function ShopPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    const [shop, wallet] = await Promise.all([
      api<{ items: ShopItem[] }>("/economy/shop" + query),
      api<{ wallets: Wallet[] }>("/economy/wallet"),
    ]);
    setItems(shop.items); setWallets(wallet.wallets);
  }, [category]);
  useEffect(() => {
    let active = true;
    void load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Không thể tải cửa hàng."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  const purchase = async (item: ShopItem) => {
    setBusy(item.id); setError(""); setNotice("");
    try {
      const result = await api<{ charged: string; balance: string; replayed?: boolean }>("/economy/purchase", {
        method: "POST", body: JSON.stringify({ itemId: item.id, quantity: 1, idempotencyKey: crypto.randomUUID() }),
      });
      setNotice(`Đã mua ${item.name}. Số dư còn ${result.balance} ${item.currency_code}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Giao dịch không thành công."); }
    finally { setBusy(""); }
  };
  return <PanelFrame title="Cửa hàng thế giới" eyebrow="WORLD SHOP · ECONOMY" onClose={onClose} wide>
    {error && <p className="bw-panel-message is-error" role="alert">{error}</p>}
    {notice && <p className="bw-panel-message" role="status">{notice}</p>}
    <div className="bw-shop-toolbar">
      <label>Danh mục<select value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="">Tất cả</option><option value="cosmetic">Trang phục & mỹ phẩm</option><option value="consumable">Vật phẩm tiêu hao</option><option value="quest">Vật phẩm nhiệm vụ</option><option value="offering">Lễ vật</option>
      </select></label>
      <div className="bw-wallet-balance"><small>Ví của bạn</small>{wallets.length ? wallets.map((wallet) => <strong key={wallet.currency_code}>{Number(wallet.balance).toLocaleString("vi-VN")} {wallet.currency_code}</strong>) : <strong>Chưa có số dư</strong>}</div>
    </div>
    {loading ? <p className="muted">Đang tải cửa hàng…</p> : <div className="bw-shop-grid">
      {items.map((item) => <article className="bw-shop-card" key={item.id}>
        <div className="bw-shop-art" aria-hidden="true"><span>{item.category === "offering" ? "✧" : item.category === "cosmetic" ? "◇" : item.category === "quest" ? "☼" : "◈"}</span></div>
        <div className="bw-shop-card-copy"><small>{item.category}</small><strong>{item.name}</strong><p>{item.description || "Vật phẩm trong Buddhist World."}</p></div>
        <footer><strong>{Number(item.price).toLocaleString("vi-VN")} {item.currency_code}</strong><button type="button" onClick={() => void purchase(item)} disabled={Boolean(busy) || item.stack_limit < 1}>{busy === item.id ? "Đang mua…" : "Mua"}</button></footer>
      </article>)}
      {items.length === 0 && <p className="bw-feature-empty">Không có vật phẩm đang được mở bán trong danh mục này.</p>}
    </div>}
  </PanelFrame>;
}

type Report = {
  id: string; reporter_username: string; reported_user_id: string; reported_username: string;
  category: string; details: string; status: "pending" | "in_review" | "resolved" | "dismissed";
  created_at: string; resolution_note?: string | null;
};
export function ModerationDashboard({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("pending");
  const [selected, setSelected] = useState<Report | null>(null);
  const [note, setNote] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(900);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const result = await api<{ reports: Report[] }>(`/admin/moderation/reports?status=${status}&limit=100`);
    setReports(result.reports);
    setSelected((current) => current ? result.reports.find((item) => item.id === current.id) ?? null : result.reports[0] ?? null);
  }, [status]);
  useEffect(() => {
    let active = true;
    void load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Không thể tải hàng đợi moderation."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  const review = async (nextStatus: "in_review" | "resolved" | "dismissed") => {
    if (!selected) return;
    setBusy("review"); setError(""); setNotice("");
    try {
      await api(`/admin/moderation/reports/${selected.id}`, {
        method: "PATCH", body: JSON.stringify({ status: nextStatus, resolutionNote: note }),
      });
      setNotice("Đã cập nhật báo cáo."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể cập nhật báo cáo."); }
    finally { setBusy(""); }
  };
  const voiceAction = async (action: "voice-mute" | "voice-unmute") => {
    if (!selected) return;
    setBusy(action); setError(""); setNotice("");
    try {
      await api(`/admin/moderation/players/${selected.reported_user_id}/${action}`, {
        method: "POST", body: action === "voice-mute" ? JSON.stringify({ durationSeconds, reason: note.trim() || "Tạm hạn chế voice theo báo cáo moderation." }) : undefined,
      });
      setNotice(action === "voice-mute" ? "Đã yêu cầu tắt voice người chơi." : "Đã gỡ hạn chế voice.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể thay đổi quyền voice."); }
    finally { setBusy(""); }
  };
  return <PanelFrame title="Moderation Dashboard" eyebrow="PLAYER SAFETY & TRUST" onClose={onClose} wide>
    {error && <p className="bw-panel-message is-error" role="alert">{error}</p>}
    {notice && <p className="bw-panel-message" role="status">{notice}</p>}
    <div className="bw-mod-toolbar"><label>Trạng thái hàng đợi<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Chờ xử lý</option><option value="in_review">Đang xem xét</option><option value="resolved">Đã giải quyết</option><option value="dismissed">Đã đóng</option><option value="">Tất cả</option></select></label><span>{reports.length} báo cáo</span></div>
    {loading ? <p className="muted">Đang tải báo cáo…</p> : <div className="bw-mod-layout">
      <div className="bw-mod-list">
        {reports.map((report) => <button type="button" key={report.id} className={selected?.id === report.id ? "bw-mod-row is-selected" : "bw-mod-row"} onClick={() => { setSelected(report); setNote(report.resolution_note ?? ""); }}>
          <span><strong>{report.reported_username}</strong><small>{report.category} · {new Date(report.created_at).toLocaleString("vi-VN")}</small></span><em>{report.status}</em>
        </button>)}
        {reports.length === 0 && <p className="bw-feature-empty">Không có báo cáo phù hợp.</p>}
      </div>
      {selected && <section className="bw-mod-detail">
        <div><small>NGƯỜI BÁO CÁO</small><strong>{selected.reporter_username}</strong></div>
        <div><small>NGƯỜI BỊ BÁO CÁO</small><strong>{selected.reported_username}</strong></div>
        <div><small>NỘI DUNG</small><p>{selected.details}</p></div>
        <label>Ghi chú xử lý<textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi rõ căn cứ và kết quả xử lý…" /></label>
        <div className="bw-mod-actions">
          <button type="button" className="ghost" onClick={() => void review("in_review")} disabled={Boolean(busy) || selected.status !== "pending"}>Nhận xử lý</button>
          <button type="button" onClick={() => void review("resolved")} disabled={Boolean(busy) || ["resolved", "dismissed"].includes(selected.status)}>Giải quyết</button>
          <button type="button" className="danger" onClick={() => void review("dismissed")} disabled={Boolean(busy) || ["resolved", "dismissed"].includes(selected.status)}>Đóng báo cáo</button>
        </div>
        <div className="bw-mod-voice">
          <label>Thời hạn voice<select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}><option value={300}>5 phút</option><option value={900}>15 phút</option><option value={3600}>1 giờ</option><option value={86400}>24 giờ</option></select></label>
          <button type="button" className="danger" onClick={() => void voiceAction("voice-mute")} disabled={Boolean(busy)}>Tạm tắt voice</button>
          <button type="button" className="ghost" onClick={() => void voiceAction("voice-unmute")} disabled={Boolean(busy)}>Gỡ hạn chế</button>
        </div>
      </section>}
    </div>}
  </PanelFrame>;
}
