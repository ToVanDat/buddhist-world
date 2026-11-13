import { useEffect } from "react";
import { DEFAULT_REGION_ID, getRegion } from "@bw/shared";
import { useNet } from "../../stores/net";
import { useGame } from "../../stores/game";
import { getWaypointDistance, getWaypointRelativeBearing } from "../../game/interactions/waypoints";

const clampPercent = (value: number) => Math.min(94, Math.max(6, value));

export function TempleGuide() {
  const regionId = useNet((state) => state.regionId) ?? DEFAULT_REGION_ID;
  const playerPosition = useGame((state) => state.playerPosition);
  const playerYaw = useGame((state) => state.playerYaw);
  const waypointId = useGame((state) => state.waypointId);
  const setWaypoint = useGame((state) => state.setWaypoint);
  const region = getRegion(regionId);
  const destinations = region?.spawns ?? [];
  const target = destinations.find((spawn) => spawn.id === waypointId);
  const distance = target ? getWaypointDistance(playerPosition, target) : null;
  const relativeBearing = target ? getWaypointRelativeBearing(playerPosition, target, playerYaw) : null;
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
    if (waypointId && !target) setWaypoint(null);
  }, [waypointId, target, setWaypoint]);

  return (
    <aside data-ui className="temple-guide" aria-label="Hướng dẫn tham quan">
      <div className="temple-guide-heading">
        <span>KHÁM PHÁ</span>
        <strong>Điểm đến</strong>
      </div>
      {region && <div className="temple-guide-map-wrap">
        <div className="temple-guide-map-label"><span>SƠ ĐỒ KHU VỰC</span><small>Không hiển thị tuyến đường</small></div>
        <div className="temple-guide-map" role="group" aria-label="Các mốc địa điểm trong khu vực">
          <span className="temple-guide-map-axis" aria-hidden="true">BẮC ↑</span>
          {destinations.map((spawn) => {
            const point = mapPoint(spawn.position[0], spawn.position[2]);
            return <button
              key={spawn.id}
              type="button"
              className={`temple-guide-map-point${waypointId === spawn.id ? " is-selected" : ""}`}
              style={{ left: `${point.left}%`, top: `${point.top}%` }}
              aria-label={`Đánh dấu ${spawn.name}`}
              aria-pressed={waypointId === spawn.id}
              title={spawn.name}
              onClick={() => setWaypoint(waypointId === spawn.id ? null : spawn.id)}
            ><span aria-hidden="true" /></button>;
          })}
          {playerInsideBounds && playerPosition && (() => {
            const point = mapPoint(playerPosition[0], playerPosition[2]);
            return <span className="temple-guide-map-player" style={{ left: `${point.left}%`, top: `${point.top}%` }} aria-label="Vị trí hiện tại của bạn"><i /></span>;
          })()}
        </div>
        <div className="temple-guide-map-legend"><span><i className="is-player" />Bạn</span><span><i />Điểm đến</span></div>
      </div>}
      <label htmlFor="temple-waypoint">Đánh dấu địa điểm</label>
      <select
        id="temple-waypoint"
        value={waypointId ?? ""}
        onChange={(event) => setWaypoint(event.target.value || null)}
      >
        <option value="">Chọn địa điểm trong chùa</option>
        {destinations.map((spawn) => (
          <option key={spawn.id} value={spawn.id}>{spawn.name}</option>
        ))}
      </select>
      {target && (
        <div className="temple-guide-target">
          <strong>{target.name}</strong>
          <span>{distance === null ? "Đang xác định vị trí…" : `Cách bạn ${Math.round(distance)} m`}</span>
          {relativeBearing !== null && <div className="temple-guide-direction" aria-label={`Hướng đến ${target.name}`}>
            <span className="temple-guide-arrow" style={{ transform: `rotate(${relativeBearing}rad)` }} aria-hidden="true">↑</span>
            <span>{Math.round(Math.abs(relativeBearing) * 180 / Math.PI)}° so với hướng nhìn</span>
          </div>}
          <p>{target.description}</p>
          <button type="button" className="ghost" onClick={() => setWaypoint(null)}>Bỏ đánh dấu</button>
        </div>
      )}
      <p className="temple-guide-footnote">Sơ đồ chỉ nối các mốc tọa độ đã khai báo; chưa có navmesh hoặc chỉ đường tránh vật cản.</p>
    </aside>
  );
}
