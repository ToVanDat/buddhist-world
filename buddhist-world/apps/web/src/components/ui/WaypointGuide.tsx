import { REGIONS, DEFAULT_REGION_ID } from "@bw/shared";
import { useGame } from "../../stores/game";
import { useNet } from "../../stores/net";

export function WaypointGuide({ onOpenMap }: { onOpenMap: () => void }) {
  const regionId = useNet((state) => state.regionId);
  const waypointId = useGame((state) => state.waypointId);
  const playerPosition = useGame((state) => state.playerPosition);
  const setWaypoint = useGame((state) => state.setWaypoint);
  const region = REGIONS[regionId ?? DEFAULT_REGION_ID] ?? REGIONS[DEFAULT_REGION_ID];
  const target = region.spawns.find((spawn) => spawn.id === waypointId);
  if (!target || !waypointId) return null;
  const distance = playerPosition
    ? Math.round(Math.hypot(playerPosition[0] - target.position[0], playerPosition[2] - target.position[2]))
    : null;

  return (
    <aside className="bw-waypoint-guide" data-ui aria-live="polite" aria-label="Điểm đến đã đánh dấu">
      <span className="bw-waypoint-guide-marker" aria-hidden="true">◎</span>
      <span className="bw-waypoint-guide-copy"><small>ĐIỂM ĐẾN</small><strong>{target.name}</strong></span>
      {distance !== null && <strong className="bw-waypoint-guide-distance">{distance} m</strong>}
      <button type="button" onClick={onOpenMap}>Bản đồ</button>
      <button type="button" className="bw-waypoint-guide-clear" onClick={() => setWaypoint(null)} aria-label="Xóa điểm đến">×</button>
    </aside>
  );
}
