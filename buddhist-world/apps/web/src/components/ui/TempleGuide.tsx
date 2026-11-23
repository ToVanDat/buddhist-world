import { useEffect, useState } from "react";
import { DEFAULT_REGION_ID, getRegion } from "@bw/shared";
import { useNet } from "../../stores/net";
import { useGame } from "../../stores/game";
import {
  getNextUnvisitedWaypointId,
  getVisitedWaypointIds,
  getVisitorTourProgress,
  getWaypointDistance,
  getWaypointRelativeBearing,
} from "../../game/interactions/waypoints";

const clampPercent = (value: number) => Math.min(94, Math.max(6, value));
const VISIT_CONFIRMATION_RADIUS = 10;

export function TempleGuide() {
  const [collapsed, setCollapsed] = useState(false);
  const regionId = useNet((state) => state.regionId) ?? DEFAULT_REGION_ID;
  const playerPosition = useGame((state) => state.playerPosition);
  const playerYaw = useGame((state) => state.playerYaw);
  const waypointId = useGame((state) => state.waypointId);
  const setWaypoint = useGame((state) => state.setWaypoint);
  const [tourState, setTourState] = useState<{ regionId: string; visitedIds: string[] }>({ regionId, visitedIds: [] });
  const region = getRegion(regionId);
  const destinations = region?.spawns ?? [];
  const storageKey = \`bw.visitor-tour.\${regionId}.v1\`;
  const visitedIds = tourState.regionId === regionId ? tourState.visitedIds : [];
  const progress = getVisitorTourProgress(destinations, visitedIds);
  const nextStopId = getNextUnvisitedWaypointId(destinations, visitedIds);
  const nextStop = destinations.find((spawn) => spawn.id === nextStopId) ?? null;
  const target = destinations.find((spawn) => spawn.id === waypointId);
  const targetVisited = Boolean(target && visitedIds.includes(target.id));
  const distance = target ? getWaypointDistance(playerPosition, target) : null;
  const relativeBearing = target ? getWaypointRelativeBearing(playerPosition, target, playerYaw) : null;
  const canConfirmVisit = Boolean(target && distance !== null && distance <= VISIT_CONFIRMATION_RADIUS && !targetVisited);
  const bounds = region?.bounds;
  const mapPoint = (x: number, z: number) => {
    if (!bounds) return { left: 50, top: 50 };
    const width = bounds.max[0] - bounds.min[0];
    const depth = bounds.max[2] - bounds.min[2];
    return {
      left: clampPercent(((x - bounds.min[0]) / width) * 100),
      top: clampPercent(((bounds.max[2] - z) / depth) * 100),
    };
  };
  const playerInsideBounds = Boolean(bounds && playerPosition &&
    playerPosition[0] >= bounds.min[0] && playerPosition[0] <= bounds.max[0] &&
    playerPosition[2] >= bounds.min[2] && playerPosition[2] <= bounds.max[2]);

  useEffect(() => {
    let saved: unknown = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      saved = raw ? JSON.parse(raw) : [];
    } catch {
      saved = [];
    }
    setTourState({ regionId, visitedIds: getVisitedWaypointIds(saved, destinations) });
  }, [regionId, storageKey, destinations]);

  useEffect(() => {
    if (tourState.regionId !== regionId) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(tourState.visitedIds));
    } catch {
      // Browser storage may be unavailable; the tour remains usable for this session.
    }
  }, [tourState, regionId, storageKey]);

  useEffect(() => {
    if (waypointId && !target) setWaypoint(null);
  }, [waypointId, target, setWaypoint]);

  const confirmVisit = () => {
    if (!target || !canConfirmVisit) return;
    const nextVisited = getVisitedWaypointIds([...visitedIds, target.id], destinations);
    setTourState({ regionId, visitedIds: nextVisited });
    setWaypoint(getNextUnvisitedWaypointId(destinations, nextVisited));
  };

  const resetTour = () => {
    setTourState({ regionId, visitedIds: [] });
    setWaypoint(getNextUnvisitedWaypointId(destinations, []));
  };

  return (
    <aside data-ui className="temple-guide" aria-label="Hướng dẫn tham quan">
      <div className="temple-guide-heading">
        <div><span>KHÁM PHÁ</span><strong>Điểm đến</strong></div>
        <button type="button" className="bw-panel-toggle" aria-label={collapsed ? "Mở hướng dẫn tham quan" : "Thu gọn hướng dẫn tham quan"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "+" : "−"}</button>
      </div>
      {!collapsed && <>
      {region && <div className="temple-guide-map-wrap">
        <div className="temple-guide-map-label"><span>SƠ ĐỒ KHU VỰC</span><small>Không hiển thị tuyến đường</small></div>
        <div className="temple-guide-map" role="group" aria-label="Các mốc địa điểm trong khu vực">
          <span className="temple-guide-map-axis" aria-hidden="true">BẮC ↑</span>
          {destinations.map((spawn) => {
            const point = mapPoint(spawn.position[0], spawn.position[2]);
            return <button
              key={spawn.id}
              type="button"
              className={\`temple-guide-map-point\${waypointId === spawn.id ? " is-selected" : ""}\${visitedIds.includes(spawn.id) ? " is-visited" : ""}\`}
              style={{ left: \`\${point.left}%\`, top: \`\${point.top}%\` }}
              aria-label={\`\${visitedIds.includes(spawn.id) ? "Đã tham quan" : "Đánh dấu"} \${spawn.name}\`}
              aria-pressed={waypointId === spawn.id}
              title={spawn.name}
              onClick={() => setWaypoint(waypointId === spawn.id ? null : spawn.id)}
            ><span aria-hidden="true" /></button>;
          })}
          {playerInsideBounds && playerPosition && (() => {
            const point = mapPoint(playerPosition[0], playerPosition[2]);
            return <span className="temple-guide-map-player" style={{ left: \`\${point.left}%\`, top: \`\${point.top}%\` }} aria-label="Vị trí hiện tại của bạn"><i /></span>;
          })()}
        </div>
        <div className="temple-guide-map-legend"><span><i className="is-player" />Bạn</span><span><i />Điểm đến</span><span><i className="is-visited" />Đã tham quan</span></div>
      </div>}
      <div className="temple-guide-tour-progress" aria-live="polite">
        <span>HÀNH TRÌNH THAM QUAN</span>
        <strong>{progress.visited}/{progress.total} điểm dừng đã ghé</strong>
        <div className="temple-guide-progress-track" role="progressbar" aria-label="Tiến độ tham quan" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.visited}>
          <span style={{ width: \`\${progress.total ? (progress.visited / progress.total) * 100 : 0}%\` }} />
        </div>
      </div>
      <label htmlFor="temple-waypoint">Đánh dấu địa điểm</label>
      <select
        id="temple-waypoint"
        value={waypointId ?? ""}
        onChange={(event) => setWaypoint(event.target.value || null)}
      >
        <option value="">Chọn địa điểm trong chùa</option>
        {destinations.map((spawn) => (
          <option key={spawn.id} value={spawn.id}>{visitedIds.includes(spawn.id) ? "✓ " : ""}{spawn.name}</option>
        ))}
      </select>
      {nextStop && <div className="temple-guide-tour">
        <span>ĐIỂM DỪNG TIẾP THEO · {progress.total} ĐIỂM</span>
        <button type="button" className="ghost" onClick={() => setWaypoint(nextStop.id)}>
          {target ? (target.id === nextStop.id ? "Đang xem điểm tiếp theo" : \`Tiếp tục đến \${nextStop.name}\`) : \`Bắt đầu tại \${nextStop.name}\`}
          <span aria-hidden="true"> ↗</span>
        </button>
        <small>Chỉ đánh dấu điểm đến theo thứ tự tham quan; không phải chỉ đường tự động.</small>
      </div>}
      {target && (
        <div className="temple-guide-target">
          <strong>{target.name}</strong>
          <span>{distance === null ? "Đang xác định vị trí…" : \`Cách bạn \${Math.round(distance)} m\`}</span>
          {relativeBearing !== null && <div className="temple-guide-direction" aria-label={\`Hướng đến \${target.name}\`}>
            <span className="temple-guide-arrow" style={{ transform: \`rotate(\${relativeBearing}rad)\` }} aria-hidden="true">↑</span>
            <span>{Math.round(Math.abs(relativeBearing) * 180 / Math.PI)}° so với hướng nhìn</span>
          </div>}
          <p>{target.description}</p>
          {targetVisited
            ? <p role="status">Bạn đã xác nhận tham quan địa điểm này.</p>
            : <button type="button" onClick={confirmVisit} disabled={!canConfirmVisit}>
                {canConfirmVisit ? "Xác nhận đã tham quan" : \`Đến trong \${VISIT_CONFIRMATION_RADIUS} m để xác nhận\`}
              </button>}
          <button type="button" className="ghost" onClick={() => setWaypoint(null)}>Bỏ đánh dấu</button>
        </div>
      )}
      {progress.complete
        ? <div className="temple-guide-tour-complete" role="status"><strong>Đã hoàn thành hành trình tham quan.</strong><button type="button" className="ghost" onClick={resetTour}>Bắt đầu hành trình mới</button></div>
        : <button type="button" className="ghost" onClick={resetTour}>Đặt lại tiến độ tham quan</button>}
      <p className="temple-guide-footnote">Tiến độ chỉ lưu trên trình duyệt này. Sơ đồ hiển thị các mốc tọa độ đã khai báo; chưa có navmesh hoặc chỉ đường tránh vật cản.</p>
      </>}
    </aside>
  );
}
