import { CHECKPOINT_RADIUS_M, DEFAULT_REGION_ID, REGIONS, type SpawnPoint } from "@bw/shared";
import { useAuth } from "../../stores/auth";
import { useGame } from "../../stores/game";

export function findNearbyCheckpoint(position: readonly [number, number, number]): SpawnPoint | null {
  let nearest: SpawnPoint | null = null;
  let nearestDistance = CHECKPOINT_RADIUS_M;
  for (const spawn of REGIONS[DEFAULT_REGION_ID]?.spawns ?? []) {
    const distance = Math.hypot(position[0] - spawn.position[0], position[2] - spawn.position[2]);
    if (distance <= nearestDistance) {
      nearest = spawn;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export async function activateCheckpoint(spawnId: string): Promise<void> {
  const game = useGame.getState();
  if (game.checkpointBusy) return;
  const spawn = REGIONS[DEFAULT_REGION_ID]?.spawns.find((item) => item.id === spawnId);
  if (!spawn) return;

  game.setCheckpointBusy(true);
  game.setCheckpointMessage(null);
  try {
    const send = () => fetch("/api/me/checkpoint", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${useAuth.getState().accessToken ?? ""}`,
      },
      body: JSON.stringify({ regionId: DEFAULT_REGION_ID, spawnId }),
    });

    let response = await send();
    if (response.status === 401 && await useAuth.getState().refresh()) response = await send();
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? "Không thể lưu điểm dừng lúc này.");
    }
    game.setCheckpointMessage(`Đã lưu điểm dừng: ${spawn.name}.`);
  } catch (error) {
    game.setCheckpointMessage(error instanceof Error ? error.message : "Không thể lưu điểm dừng.");
  } finally {
    game.setCheckpointBusy(false);
  }
}
