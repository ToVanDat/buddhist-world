import { useEffect, useMemo, useState } from "react";
import { findNavmeshRoute, type NavmeshData, type NavmeshRoute } from "../../game/navigation/navmesh";
import { DEFAULT_REGION_ID, REGIONS } from "@bw/shared";
import { useGame } from "../../stores/game";
import { useNet } from "../../stores/net";

type WorldMapProps = { onClose: () => void };

const MAP_MIN = 48;
const MAP_MAX = 552;
const MAP_SIZE = MAP_MAX - MAP_MIN;

function projectToMap(x: number, z: number, bounds: { min: number[]; max: number[] }) {
  const width = bounds.max[0]! - bounds.min[0]!;
  const depth = bounds.max[2]! - bounds.min[2]!;
  if (!(width > 0) || !(depth > 0)) return { x: 300, y: 300 };
  return {
    x: MAP_MIN + ((x - bounds.min[0]!) / width) * MAP_SIZE,
    y: MAP_MIN + ((bounds.max[2]! - z) / depth) * MAP_SIZE,
  };
}

function clampPoint(point: { x: number; y: number }) {
  return {
    x: Math.min(MAP_MAX, Math.max(MAP_MIN, point.x)),
    y: Math.min(MAP_MAX, Math.max(MAP_MIN, point.y)),
  };
}

export function WorldMap({ onClose }: WorldMapProps) {
  const regionId = useNet((state) => state.regionId);
  const playerPosition = useGame((state) => state.playerPosition);
  const region = REGIONS[regionId ?? DEFAULT_REGION_ID] ?? REGIONS[DEFAULT_REGION_ID];
  const [selectedId, setSelectedId] = useState(region.defaultSpawn);
  const waypointId = useGame((state) => state.waypointId);
  const setWaypoint = useGame((state) => state.setWaypoint);
  const [navmesh, setNavmesh] = useState<NavmeshData | null>(null);
  const [navmeshStatus, setNavmeshStatus] = useState<"loading" | "ready" | "missing" | "invalid">("loading");

  const landmarks = useMemo(
    () => region.spawns.map((spawn) => ({
      ...spawn,
      point: projectToMap(spawn.position[0], spawn.position[2], region.bounds),
    })),
    [region],
  );
  const selected = landmarks.find((landmark) => landmark.id === selectedId) ?? landmarks[0];
  const playerPoint = playerPosition
    ? clampPoint(projectToMap(playerPosition[0], playerPosition[2], region.bounds))
    : null;
  const selectedDistance = playerPosition && selected
    ? Math.round(Math.hypot(
        playerPosition[0] - selected.position[0],
        playerPosition[2] - selected.position[2],
      ))
    : null;

  useEffect(() => {
    let active = true;
    setNavmesh(null);
    setNavmeshStatus("loading");
    if (!region.navmesh) {
      setNavmeshStatus("missing");
      return () => { active = false; };
    }
    fetch(region.navmesh, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Navmesh unavailable");
        return response.json() as Promise<NavmeshData>;
      })
      .then((data) => {
        if (!active) return;
        if (data.regionId !== region.id || !Array.isArray(data.polygons) || !data.polygons.length) {
          setNavmeshStatus("invalid");
          return;
        }
        setNavmesh(data);
        setNavmeshStatus("ready");
      })
      .catch(() => { if (active) setNavmeshStatus("missing"); });
    return () => { active = false; };
  }, [region.id, region.navmesh]);

  const route: NavmeshRoute | null = useMemo(() => {
    if (!navmesh || !playerPosition || !selected) return null;
    return findNavmeshRoute(navmesh, playerPosition, selected.position);
  }, [navmesh, playerPosition, selected]);
  const routePolyline = route?.points.map((point) => {
    const projected = clampPoint(projectToMap(point[0], point[2], region.bounds));
    return `${projected.x},${projected.y}`;
  }).join(" ") ?? "";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="bw-world-map-backdrop" data-ui onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="bw-world-map" role="dialog" aria-modal="true" aria-labelledby="bw-world-map-title">
        <header className="bw-world-map-header">
          <div>
            <span className="bw-world-map-eyebrow">BUDDHIST WORLD · ĐỊNH HƯỚNG</span>
            <h2 id="bw-world-map-title">Bản đồ khuôn viên</h2>
            <p>{region.name} · Bản đồ sơ đồ theo tọa độ thế giới</p>
          </div>
          <button type="button" className="bw-world-map-close" onClick={onClose} aria-label="Đóng bản đồ">×</button>
        </header>

        <div className="bw-world-map-content">
          <div className="bw-world-map-canvas">
            <svg viewBox="0 0 600 600" role="img" aria-label="Sơ đồ vị trí các địa điểm trong khuôn viên chùa">
              <defs>
                <pattern id="bw-map-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(220,205,164,.10)" strokeWidth="1" />
                </pattern>
                <radialGradient id="bw-map-ground">
                  <stop offset="0%" stopColor="#344b38" />
                  <stop offset="100%" stopColor="#18271e" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width="600" height="600" rx="22" fill="url(#bw-map-ground)" />
              <rect x="0" y="0" width="600" height="600" rx="22" fill="url(#bw-map-grid)" />
              <rect x="48" y="48" width="504" height="504" rx="10" fill="none" stroke="rgba(218,196,145,.42)" strokeDasharray="5 7" />
              <path d="M300 86 V514 M86 300 H514" stroke="rgba(218,196,145,.14)" strokeDasharray="3 9" />
              <path d="M300 135 C270 205 330 235 300 300 S330 395 300 465" fill="none" stroke="#b6a27a" strokeWidth="12" strokeLinecap="round" opacity=".22" />
              <path d="M300 135 C270 205 330 235 300 300 S330 395 300 465" fill="none" stroke="#d1bd91" strokeWidth="1.5" strokeDasharray="5 8" opacity=".62" />
              <ellipse cx="262" cy="292" rx="33" ry="25" fill="#315f62" stroke="#8bb5a4" strokeWidth="2" opacity=".92" />
              <path d="M245 292 Q262 279 279 292 Q262 305 245 292Z" fill="#8eb79a" opacity=".55" />
              <g fill="#829a70" opacity=".58">
                <circle cx="140" cy="160" r="12" /><circle cx="172" cy="135" r="9" /><circle cx="430" cy="155" r="13" />
                <circle cx="462" cy="190" r="9" /><circle cx="145" cy="420" r="13" /><circle cx="185" cy="458" r="10" />
                <circle cx="438" cy="420" r="12" /><circle cx="470" cy="455" r="9" />
              </g>
              {routePolyline && <polyline points={routePolyline} fill="none" stroke="#8ed5e8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 6" />}
              {landmarks.map((landmark) => {
                const active = selected?.id === landmark.id;
                return (
                  <g key={landmark.id} className={active ? "is-active" : ""}>
                    {active && <circle cx={landmark.point.x} cy={landmark.point.y} r="19" fill="rgba(224,197,137,.16)" />}
                    <circle cx={landmark.point.x} cy={landmark.point.y} r={active ? 9 : 7} fill={active ? "#e7cb8d" : "#d4d0b9"} stroke="#17231a" strokeWidth="3" />
                    <circle cx={landmark.point.x} cy={landmark.point.y} r="2.5" fill="#253329" />
                    <text x={landmark.point.x + 13} y={landmark.point.y - 12} fill="#f0e8d6" fontSize="12" fontWeight="600">{landmark.name}</text>
                  </g>
                );
              })}
              {playerPoint && <g aria-label="Vị trí hiện tại">
                <circle cx={playerPoint.x} cy={playerPoint.y} r="16" fill="rgba(120,190,218,.18)" />
                <circle cx={playerPoint.x} cy={playerPoint.y} r="7" fill="#7ec7e4" stroke="#10222b" strokeWidth="3" />
                <path d={`M ${playerPoint.x} ${playerPoint.y - 22} l -5 -8 h 10 Z`} fill="#7ec7e4" />
              </g>}
              <g transform="translate(520 82)">
                <path d="M0 20 L8 0 L16 20 L8 15 Z" fill="#e4cf9e" />
                <text x="8" y="34" textAnchor="middle" fill="#d9ceb5" fontSize="10">BẮC</text>
              </g>
            </svg>
            <div className="bw-world-map-legend">
              <span><i className="is-player" /> Bạn</span>
              <span><i className="is-landmark" /> Địa điểm</span>
              <span><i className="is-water" /> Hồ sen</span>
            </div>
          </div>

          <aside className="bw-world-map-sidebar">
            <div className="bw-world-map-section-label">ĐỊA ĐIỂM TRONG KHUÔN VIÊN</div>
            <div className="bw-world-map-landmarks">
              {landmarks.map((landmark, index) => (
                <button key={landmark.id} type="button"
                  className={`bw-world-map-landmark${selected?.id === landmark.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(landmark.id)}
                  aria-pressed={selected?.id === landmark.id}>
                  <span className="bw-world-map-number">{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{landmark.name}</strong><small>{landmark.description}</small></span>
                  <span className="bw-world-map-chevron">›</span>
                </button>
              ))}
            </div>
            {selected && <div className="bw-world-map-detail" aria-live="polite">
              <span className="bw-world-map-section-label">ĐIỂM ĐANG CHỌN</span>
              <strong>{selected.name}</strong>
              <p>{selected.description}</p>
              <button type="button" className="bw-world-map-waypoint" onClick={() => setWaypoint(waypointId === selected.id ? null : selected.id)}>{waypointId === selected.id ? "Xóa điểm đến" : "Đặt làm điểm đến"}</button>
              <button type="button" className="bw-world-map-waypoint" onClick={() => setWaypoint(waypointId === selected.id ? null : selected.id)}>{waypointId === selected.id ? "Xóa điểm đến" : "Đặt làm điểm đến"}</button>
              <div className="bw-world-map-coordinates">
                <span>TỌA ĐỘ</span>
                <code>{selected.position[0].toFixed(1)}, {selected.position[2].toFixed(1)}</code>
              </div>
              {selectedDistance !== null && <div className="bw-world-map-distance">
                <span>Khoảng cách đường thẳng</span><strong>{selectedDistance} m</strong>
              </div>}
            </div>}
            <p className="bw-world-map-note">{navmeshStatus === "ready" ? "Đường nét xanh biểu thị lộ trình ước tính qua các tam giác navmesh. Hãy nghiệm thu mesh thực tế trước khi phát hành." : "Chưa có navmesh hợp lệ cho khu vực này. Bản đồ vẫn định vị được địa điểm nhưng chưa thể dẫn đường tránh vật cản."}</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
