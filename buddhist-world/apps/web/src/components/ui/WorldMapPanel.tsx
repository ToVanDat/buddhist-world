import { useState } from "react";
import { DEFAULT_REGION_ID, REGIONS } from "@bw/shared";
import { motion } from "framer-motion";

interface WorldMapPanelProps { onClose: () => void }

export function WorldMapPanel({ onClose }: WorldMapPanelProps) {
  const region = REGIONS[DEFAULT_REGION_ID]!;
  const [selectedId, setSelectedId] = useState(region.defaultSpawn);
  const selected = region.spawns.find((spawn) => spawn.id === selectedId) ?? region.spawns[0]!;
  const width = Math.max(1, region.bounds.max[0] - region.bounds.min[0]);
  const depth = Math.max(1, region.bounds.max[2] - region.bounds.min[2]);

  return (
    <motion.div className="bw-feature-backdrop" data-ui role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="bw-feature-panel bw-map-panel" role="dialog" aria-modal="true" aria-labelledby="bw-map-title"
        initial={{ opacity: 0, y: 16, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>
        <header className="bw-feature-heading">
          <div><span>KHÁM PHÁ · {region.name.toLocaleUpperCase("vi-VN")}</span><h2 id="bw-map-title">Bản đồ khuôn viên</h2><p>Chọn một điểm mốc để xem thông tin và định hướng hành trình.</p></div>
          <button type="button" className="bw-feature-close" onClick={onClose} aria-label="Đóng bản đồ">×</button>
        </header>
        <div className="bw-map-layout">
          <div className="bw-map-canvas" role="group" aria-label="Sơ đồ các điểm mốc trong khuôn viên">
            <div className="bw-map-compass" aria-hidden="true">N<br />↑</div>
            <div className="bw-map-grid" aria-hidden="true" />
            <div className="bw-map-path" aria-hidden="true" />
            {region.spawns.map((spawn, index) => {
              const x = Math.min(92, Math.max(8, ((spawn.position[0] - region.bounds.min[0]) / width) * 100));
              const y = Math.min(90, Math.max(10, ((spawn.position[2] - region.bounds.min[2]) / depth) * 100));
              return <button key={spawn.id} type="button" className={`bw-map-pin${selectedId === spawn.id ? " is-selected" : ""}`}
                style={{ left: `${x}%`, top: `${y}%` }} onClick={() => setSelectedId(spawn.id)}
                aria-pressed={selectedId === spawn.id} aria-label={`Chọn ${spawn.name}`}>
                <i>{String(index + 1).padStart(2, "0")}</i><span>{spawn.name}</span>
              </button>;
            })}
            <span className="bw-map-scale">SƠ ĐỒ ĐIỂM MỐC · KHÔNG THEO TỈ LỆ</span>
          </div>
          <aside className="bw-map-detail">
            <span className="bw-map-detail-kicker">ĐIỂM ĐANG CHỌN</span>
            <span className="bw-map-detail-number">{String(region.spawns.findIndex((spawn) => spawn.id === selected.id) + 1).padStart(2, "0")}</span>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <div className="bw-map-coordinates"><span>TỌA ĐỘ THẾ GIỚI</span><strong>{selected.position.map((value) => value.toFixed(1)).join(" · ")}</strong></div>
            <p className="bw-map-note">Bản đồ đang hiển thị các spawn point được khai báo trong region manifest. Chưa hỗ trợ dịch chuyển nhanh hoặc dẫn đường theo navmesh.</p>
            <button type="button" className="bw-feature-action" onClick={onClose} aria-label="Đóng bản đồ và quay lại thế giới">ĐÓNG BẢN ĐỒ</button>
          </aside>
        </div>
      </motion.section>
    </motion.div>
  );
}
