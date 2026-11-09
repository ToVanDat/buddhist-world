import { useEffect } from "react";
import { DEFAULT_REGION_ID, getRegion } from "@bw/shared";
import { useNet } from "../../stores/net";
import { useGame } from "../../stores/game";
import { getWaypointDistance, getWaypointRelativeBearing } from "../../game/interactions/waypoints";

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

  useEffect(() => {
    if (waypointId && !target) setWaypoint(null);
  }, [waypointId, target, setWaypoint]);

  return (
    <aside data-ui className="temple-guide" aria-label="Hướng dẫn tham quan">
      <div className="temple-guide-heading">
        <span>KHÁM PHÁ</span>
        <strong>Điểm đến</strong>
      </div>
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
      <p className="temple-guide-footnote">Mốc dẫn đường chỉ hiển thị trong phiên chơi hiện tại.</p>
    </aside>
  );
}
