import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";
import { redis } from "../../lib/redis.js";
import { hit } from "../../lib/rateLimit.js";
import { getRegion, getWorldInteraction } from "@bw/shared";
import { isNearWorldInteraction } from "./rules.js";
import { isFreshPresenceTimestamp } from "../me/checkpoints.js";
import { resolveNpcSchedule, validateNpcSchedule, type NpcScheduleEntry } from "./npcSchedule.js";
import { routeNpcScheduleRows } from "./npcSnapshots.js";
import { findNavmeshPath, loadRegionNavmesh } from "./navmeshPathfinding.js";
import { getWorldClockTime } from "./worldClock.js";
import { env } from "../../config/env.js";
import { createWorldEnvironmentSnapshot } from "./worldEnvironment.js";
import { getNpcDialogueNode, validateNpcDialogueGraph } from "./dialogueGraph.js";
import { isNearTourStop, sanitizeVisitedSpawnIds } from "./tourProgress.js";


export const worldRouter = Router();
worldRouter.use(requireAuth);

/** Per-player action limits fail closed when the shared limiter is unavailable. */
async function allowWorldAction(
  req: Request,
  res: Response,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    if (await hit(`world-action:${action}:${req.auth!.sub}`, limit, windowSeconds)) return true;
    res.status(429).json({ error: "Bạn thực hiện thao tác quá nhanh. Vui lòng thử lại sau." });
    return false;
  } catch {
    res.status(503).json({ error: "Dịch vụ bảo vệ thao tác tạm thời không khả dụng." });
    return false;
  }
}

const navmeshCache = new Map<string, ReturnType<typeof loadRegionNavmesh>>();
function findRegionNavmeshPath(regionId: string, start: [number, number, number], end: [number, number, number]) {
  if (!navmeshCache.has(regionId)) navmeshCache.set(regionId, loadRegionNavmesh(regionId));
  const mesh = navmeshCache.get(regionId);
  return mesh ? findNavmeshPath(mesh, start, end) : undefined;
}

function getRoutedNpcSchedule(regionId: string, npcId: string, schedule: unknown): NpcScheduleEntry[] {
  const [routed] = routeNpcScheduleRows([{
    id: npcId, region_id: regionId, name: npcId, title: "", schedule,
  }], findRegionNavmeshPath);
  return validateNpcSchedule(routed?.schedule);
}

/** Current authoritative time-of-day and configured weather state. */
worldRouter.get("/environment", (_req, res) => {
  res.json(createWorldEnvironmentSnapshot(new Date(), env.WORLD_WEATHER, env.WORLD_WEATHER_INTENSITY));
});

/** Current authoritative NPC state for the player's active world region. */
worldRouter.get("/npcs", async (req, res) => {
  if (!(await allowWorldAction(req, res, "npc-snapshot", 60, 60))) return;
  const regionId = typeof req.query.regionId === "string" ? req.query.regionId : "";
  if (!/^[a-z0-9_-]{1,64}$/i.test(regionId) || !getRegion(regionId)) {
    res.status(400).json({ error: "Mã khu vực không hợp lệ." });
    return;
  }

  const worldTime = getWorldClockTime();
  const worldMinute = worldTime.minute;

  const result = await pool.query<{
    id: string; name: string; title: string; schedule: unknown;
  }>(
    "SELECT id, name, title, schedule FROM world_npcs WHERE region_id = $1 AND is_active = true ORDER BY id",
    [regionId],
  );

  const routedRows = routeNpcScheduleRows(
    result.rows.map((npc) => ({ ...npc, region_id: regionId })),
    findRegionNavmeshPath,
  );
  const npcs = routedRows.map((npc) => {
    const schedule: NpcScheduleEntry[] = validateNpcSchedule(npc.schedule);
    const state = resolveNpcSchedule(schedule, worldMinute, worldTime.second);
    return {
      id: npc.id, name: npc.name, title: npc.title,
      active: state.entry !== null,
      state: state.entry,
      nextChangeMinute: state.nextChangeMinute,
    };
  });
  res.json({ regionId, worldMinute, timeZone: "Asia/Ho_Chi_Minh", npcs });
});

worldRouter.post("/npcs/:npcId/dialogue/choice", async (req, res) => {
  const npcId = typeof req.params.npcId === "string" ? req.params.npcId : "";
  const body = z.object({
    nodeId: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
    choiceId: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
  }).safeParse(req.body);
  if (!/^[a-z0-9_-]{1,64}$/i.test(npcId) || !body.success) {
    res.status(400).json({ error: "Lựa chọn hội thoại không hợp lệ." });
    return;
  }
  if (!(await hit(`npc-dialogue-choice:${req.auth!.sub}:${npcId}`, 12, 60))) {
    res.status(429).json({ error: "Bạn chọn hội thoại quá nhanh. Vui lòng thử lại sau." });
    return;
  }

  const npcResult = await pool.query<{ region_id: string; dialogue_graph: unknown }>(
    "SELECT region_id, dialogue_graph FROM world_npcs WHERE id = $1 AND is_active = true",
    [npcId],
  );
  const npc = npcResult.rows[0];
  if (!npc) {
    res.status(404).json({ error: "Không tìm thấy nhân vật." });
    return;
  }
  const graph = validateNpcDialogueGraph(npc.dialogue_graph);

  let presence: Record<string, string>;
  try {
    presence = await redis.hgetall(`presence:${req.auth!.sub}`);
  } catch {
    res.status(503).json({ error: "Không thể xác minh vị trí hiện tại. Vui lòng thử lại." });
    return;
  }
  const position = [Number(presence.x), Number(presence.y), Number(presence.z)] as [number, number, number];
  const presenceRegion = presence.region;
  if (!presenceRegion || presenceRegion !== npc.region_id || !isFreshPresenceTimestamp(Number(presence.heartbeatAt))) {
    res.status(409).json({ error: "Bạn cần đến gần nhân vật để lựa chọn hội thoại." });
    return;
  }
  let scheduledPosition: [number, number, number] | undefined;
  let scheduleAvailable = false;
  try {
    const scheduleResult = await pool.query<{ schedule: unknown }>(
      "SELECT schedule FROM world_npcs WHERE id = $1 AND is_active = true",
      [npcId],
    );
    if (scheduleResult.rows[0]) {
      scheduleAvailable = true;
      const worldTime = getWorldClockTime();
      const entry = resolveNpcSchedule(getRoutedNpcSchedule(npc.region_id, npcId, scheduleResult.rows[0].schedule), worldTime.minute, worldTime.second).entry;
      if (entry && entry.regionId === presenceRegion) scheduledPosition = entry.position;
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42703")) throw error;
  }
  const nearNpc = scheduleAvailable
    ? !!scheduledPosition && isNearWorldInteraction(position, presenceRegion, npcId, scheduledPosition)
    : isNearWorldInteraction(position, presenceRegion, npcId);
  if (!nearNpc) {
    res.status(409).json({ error: "Bạn cần đến gần nhân vật để lựa chọn hội thoại." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${req.auth!.sub}:${npcId}`]);
    const saved = await client.query<{ current_node_id: string; flags: Record<string, boolean>; unlocked_quest_ids: string[]; choice_history: unknown }>(
      "SELECT current_node_id, flags, unlocked_quest_ids, choice_history FROM player_npc_dialogue_state WHERE user_id = $1 AND npc_id = $2 FOR UPDATE",
      [req.auth!.sub, npcId],
    );
    const currentNodeId = saved.rows[0]?.current_node_id ?? graph.startNodeId;
    if (currentNodeId !== body.data.nodeId) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Hội thoại đã thay đổi. Hãy mở lại cuộc trò chuyện." });
      return;
    }
    const currentNode = getNpcDialogueNode(graph, currentNodeId);
    const choice = currentNode?.choices.find((item) => item.id === body.data.choiceId);
    if (!choice) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Lựa chọn không tồn tại trong nhánh hội thoại này." });
      return;
    }
    const flags = { ...(saved.rows[0]?.flags ?? {}), ...(choice.setFlag ? { [choice.setFlag]: true } : {}) };
    const unlockedQuestIds = [...new Set([...(saved.rows[0]?.unlocked_quest_ids ?? []), ...(choice.unlockQuestIds ?? [])])];
    const historyEntry = JSON.stringify([{ nodeId: currentNodeId, choiceId: choice.id, selectedAt: new Date().toISOString() }]);
    await client.query(
      `INSERT INTO player_npc_dialogue_state (user_id, npc_id, current_node_id, flags, unlocked_quest_ids, choice_history, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6::jsonb, now())
       ON CONFLICT (user_id, npc_id) DO UPDATE SET current_node_id = EXCLUDED.current_node_id,
         flags = EXCLUDED.flags, unlocked_quest_ids = EXCLUDED.unlocked_quest_ids,
         choice_history = player_npc_dialogue_state.choice_history || EXCLUDED.choice_history,
         updated_at = now()`,
      [req.auth!.sub, npcId, choice.nextNodeId, JSON.stringify(flags), unlockedQuestIds, historyEntry],
    );
    await client.query("COMMIT");

    const nextNode = getNpcDialogueNode(graph, choice.nextNodeId)!;
    const offers = unlockedQuestIds.length ? await pool.query(
      `SELECT q.id, q.title, q.description, q.rewards
         FROM world_quests q
         LEFT JOIN player_quests pq ON pq.quest_id = q.id AND pq.user_id = $1
        WHERE q.npc_id = $2 AND q.id = ANY($3::text[]) AND q.is_active = true
          AND (pq.status IS NULL OR pq.status = 'abandoned' OR (pq.status = 'completed' AND q.is_repeatable = true))
        ORDER BY q.created_at, q.id`,
      [req.auth!.sub, npcId, unlockedQuestIds],
    ) : { rows: [] };
    res.json({ npcId, node: nextNode, flags, unlockedQuestIds, questOffers: offers.rows });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

/** Read the authenticated player's optional tour progress for a manifest region. */
worldRouter.get("/tour", async (req, res) => {
  const regionId = typeof req.query.regionId === "string" ? req.query.regionId : "";
  const region = getRegion(regionId);
  if (!region) {
    res.status(400).json({ error: "Mã khu vực không hợp lệ." });
    return;
  }
  const result = await pool.query<{ visited_spawn_ids: string[] }>(
    "SELECT visited_spawn_ids FROM player_tour_progress WHERE user_id = $1 AND region_id = $2",
    [req.auth!.sub, region.id],
  );
  res.json({
    regionId: region.id,
    visitedSpawnIds: sanitizeVisitedSpawnIds(result.rows[0]?.visited_spawn_ids ?? [], region.spawns.map((spawn) => spawn.id)),
  });
});

/** A tour stop is durable only when fresh server presence is physically near its manifest spawn. */
worldRouter.post("/tour/visit", async (req, res) => {
  const body = z.object({
    regionId: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
    spawnId: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Điểm tham quan không hợp lệ." });
    return;
  }
  if (!(await hit(`tour-visit:${req.auth!.sub}`, 12, 60))) {
    res.status(429).json({ error: "Bạn xác nhận điểm tham quan quá nhanh. Vui lòng thử lại sau." });
    return;
  }
  const region = getRegion(body.data.regionId);
  const spawn = region?.spawns.find((item) => item.id === body.data.spawnId);
  if (!region || !spawn) {
    res.status(400).json({ error: "Điểm tham quan không tồn tại trong bản đồ khu vực." });
    return;
  }

  let presence: Record<string, string>;
  try {
    presence = await redis.hgetall(`presence:${req.auth!.sub}`);
  } catch {
    res.status(503).json({ error: "Không thể xác minh vị trí hiện tại. Vui lòng thử lại." });
    return;
  }
  const position = [Number(presence.x), Number(presence.y), Number(presence.z)] as [number, number, number];
  if (!presence.region || !isFreshPresenceTimestamp(Number(presence.heartbeatAt)) ||
      !isNearTourStop(position, presence.region, region.id, spawn.position)) {
    res.status(409).json({ error: "Hãy đến gần điểm tham quan trong thế giới để xác nhận." });
    return;
  }

  const saved = await pool.query<{ visited_spawn_ids: string[] }>(
    `INSERT INTO player_tour_progress (user_id, region_id, visited_spawn_ids)
     VALUES ($1, $2, ARRAY[$3]::text[])
     ON CONFLICT (user_id, region_id) DO UPDATE SET
       visited_spawn_ids = (
         SELECT ARRAY(SELECT DISTINCT value FROM unnest(player_tour_progress.visited_spawn_ids || EXCLUDED.visited_spawn_ids) AS ids(value) ORDER BY value)
       ),
       updated_at = now()
     RETURNING visited_spawn_ids`,
    [req.auth!.sub, region.id, spawn.id],
  );
  res.json({
    regionId: region.id,
    visitedSpawnIds: sanitizeVisitedSpawnIds(saved.rows[0]?.visited_spawn_ids ?? [], region.spawns.map((item) => item.id)),
  });
});

/** Reset is explicit and scoped to the authenticated player's own region progress. */
worldRouter.delete("/tour/:regionId", async (req, res) => {
  const regionId = typeof req.params.regionId === "string" ? req.params.regionId : "";
  const region = getRegion(regionId);
  if (!region) {
    res.status(400).json({ error: "Mã khu vực không hợp lệ." });
    return;
  }
  if (!(await hit(`tour-reset:${req.auth!.sub}`, 4, 60))) {
    res.status(429).json({ error: "Bạn đặt lại hành trình quá nhanh. Vui lòng thử lại sau." });
    return;
  }
  await pool.query("DELETE FROM player_tour_progress WHERE user_id = $1 AND region_id = $2", [req.auth!.sub, region.id]);
  res.status(204).end();
});

worldRouter.get("/quests", async (req, res) => {
  const result = await pool.query(
    `SELECT q.id, q.title, q.description, q.objectives, q.rewards, q.is_repeatable,
            pq.status, COALESCE(pq.progress, '{}'::jsonb) AS progress,
            pq.accepted_at, pq.completed_at
       FROM world_quests q
       LEFT JOIN player_quests pq ON pq.quest_id = q.id AND pq.user_id = $1
      WHERE q.is_active = true
      ORDER BY q.created_at, q.id`,
    [req.auth!.sub],
  );
  res.json({ quests: result.rows });
});

worldRouter.post("/quests/:questId/accept", async (req, res) => {
  if (!(await allowWorldAction(req, res, "quest-accept", 10, 60))) return;
  const questId = typeof req.params.questId === "string" ? req.params.questId : "";
  if (!/^[a-z0-9_-]{1,64}$/i.test(questId)) {
    res.status(400).json({ error: "Mã nhiệm vụ không hợp lệ." });
    return;
  }

  // NPC-linked quests can only be accepted while the player is near that NPC.
  // This prevents bypassing the in-world dialogue by calling the REST endpoint directly.
  const questMeta = await pool.query<{ npc_id: string | null }>(
    "SELECT npc_id FROM world_quests WHERE id = $1 AND is_active = true",
    [questId],
  );
  if (!questMeta.rows[0]) {
    res.status(404).json({ error: "Không tìm thấy nhiệm vụ." });
    return;
  }
  const npcId = questMeta.rows[0].npc_id;
  if (npcId) {
    let presence: Record<string, string>;
    try {
      presence = await redis.hgetall(`presence:${req.auth!.sub}`);
    } catch {
      res.status(503).json({ error: "Không thể xác minh vị trí hiện tại. Vui lòng thử lại." });
      return;
    }
    const position = [Number(presence.x), Number(presence.y), Number(presence.z)] as [number, number, number];
    const presenceRegion = presence.region;
    if (!presenceRegion || !isFreshPresenceTimestamp(Number(presence.heartbeatAt))) {
      res.status(409).json({ error: "Bạn cần đến gần nhân vật giao nhiệm vụ để nhận nhiệm vụ này." });
      return;
    }
    let scheduledPosition: [number, number, number] | undefined;
    let scheduleAvailable = false;
    try {
      const npc = await pool.query<{ region_id: string; schedule: unknown }>(
        "SELECT region_id, schedule FROM world_npcs WHERE id = $1 AND is_active = true",
        [npcId],
      );
      if (npc.rows[0]) {
        scheduleAvailable = true;
        const worldTime = getWorldClockTime();
        const entry = resolveNpcSchedule(getRoutedNpcSchedule(npc.rows[0].region_id, npcId, npc.rows[0].schedule), worldTime.minute, worldTime.second).entry;
        if (entry && entry.regionId === presenceRegion) scheduledPosition = entry.position;
      }
    } catch (error) {
      // Older local databases may not have migration 006 yet; preserve the
      // original static NPC range only for the missing-column compatibility case.
      if (!(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42703")) throw error;
    }
    const nearNpc = scheduleAvailable
      ? !!scheduledPosition && isNearWorldInteraction(position, presenceRegion, npcId, scheduledPosition)
      : isNearWorldInteraction(position, presenceRegion, npcId);
    if (!nearNpc) {
      res.status(409).json({ error: "Bạn cần đến gần nhân vật giao nhiệm vụ để nhận nhiệm vụ này." });
      return;
    }
    const graphResult = await pool.query<{ dialogue_graph: unknown }>(
      "SELECT to_jsonb(world_npcs)->'dialogue_graph' AS dialogue_graph FROM world_npcs WHERE id = $1",
      [npcId],
    );
    const dialogueGraph = graphResult.rows[0]?.dialogue_graph;
    if (dialogueGraph && typeof dialogueGraph === "object" && Object.keys(dialogueGraph as object).length > 0) {
      const dialogueState = await pool.query<{ unlocked_quest_ids: string[] }>(
        "SELECT unlocked_quest_ids FROM player_npc_dialogue_state WHERE user_id = $1 AND npc_id = $2",
        [req.auth!.sub, npcId],
      );
      if (!dialogueState.rows[0]?.unlocked_quest_ids.includes(questId)) {
        res.status(403).json({ error: "Hãy chọn nhánh hội thoại mở khóa nhiệm vụ này trước." });
        return;
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quest = await client.query<{ id: string; is_repeatable: boolean }>(
      "SELECT id, is_repeatable FROM world_quests WHERE id = $1 AND is_active = true FOR SHARE",
      [questId],
    );
    if (!quest.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy nhiệm vụ." });
      return;
    }
    // Lock even when no player_quests row exists yet; FOR UPDATE cannot
    // serialize concurrent first-time accepts of an absent row.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${req.auth!.sub}:${questId}`]);
    const current = await client.query<{ status: string }>(
      "SELECT status FROM player_quests WHERE user_id = $1 AND quest_id = $2 FOR UPDATE",
      [req.auth!.sub, questId],
    );
    if (current.rows[0]?.status === "active" ||
        (current.rows[0]?.status === "completed" && !quest.rows[0].is_repeatable)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Nhiệm vụ này đã được nhận hoặc hoàn thành." });
      return;
    }
    await client.query(
      `INSERT INTO player_quests (user_id, quest_id, status, progress, accepted_at, completed_at)
       VALUES ($1, $2, 'active', '{}'::jsonb, now(), NULL)
       ON CONFLICT (user_id, quest_id) DO UPDATE
         SET status = 'active', progress = '{}'::jsonb, accepted_at = now(), completed_at = NULL`,
      [req.auth!.sub, questId],
    );
    await client.query("COMMIT");
    res.status(201).json({ questId, status: "active" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});


worldRouter.post("/quests/:questId/abandon", async (req, res) => {
  if (!(await allowWorldAction(req, res, "quest-abandon", 10, 60))) return;
  const questId = typeof req.params.questId === "string" ? req.params.questId : "";
  if (!/^[a-z0-9_-]{1,64}$/i.test(questId)) {
    res.status(400).json({ error: "Mã nhiệm vụ không hợp lệ." });
    return;
  }
  const result = await pool.query(
    `UPDATE player_quests SET status = 'abandoned'
      WHERE user_id = $1 AND quest_id = $2 AND status = 'active'
      RETURNING quest_id`,
    [req.auth!.sub, questId],
  );
  if (!result.rowCount) {
    res.status(409).json({ error: "Chỉ có thể từ bỏ nhiệm vụ đang thực hiện." });
    return;
  }
  res.json({ questId, status: "abandoned" });
});

worldRouter.get("/achievements", async (req, res) => {
  const result = await pool.query(
    `SELECT a.id, a.title, a.description, a.category, a.icon,
            a.required_count AS target_count,
            LEAST(a.required_count, COALESCE(progress.current_count, 0)) AS progress,
            pa.unlocked_at
       FROM world_achievements a
       LEFT JOIN player_achievements pa
         ON pa.achievement_id = a.id AND pa.user_id = $1
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT e.target_id)::int AS current_count
           FROM world_events e
          WHERE e.actor_user_id = $1 AND e.target_id = ANY(a.target_ids)
       ) progress ON true
      WHERE a.is_active = true
      ORDER BY a.category, a.id`,
    [req.auth!.sub],
  );
  res.json({ achievements: result.rows });
});

worldRouter.get("/events", async (req, res) => {
  const requested = typeof req.query.limit === "string" ? Number(req.query.limit) : 30;
  const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.floor(requested))) : 30;
  let livePresence: Record<string, string> = {};
  try {
    livePresence = await redis.hgetall(`presence:${req.auth!.sub}`);
  } catch {
    // The durable player location remains a read-only fallback for the activity journal.
  }
  const savedLocation = livePresence.region ? null : await pool.query(
    "SELECT region_id FROM player_locations WHERE user_id = $1",
    [req.auth!.sub],
  );
  const regionId = livePresence.region || savedLocation?.rows[0]?.region_id || "temple_complex";
  const result = await pool.query(
    `SELECT id, region_id, actor_name, target_id, interaction_kind, created_at
       FROM world_events
      WHERE region_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [regionId, limit],
  );
  res.json({ events: result.rows });
});

worldRouter.get("/inventory", async (req, res) => {
  const result = await pool.query(
    `SELECT i.id, i.name, i.description, i.category, i.metadata, i.stack_limit, pi.quantity, pi.acquired_at
       FROM player_inventory pi
       JOIN world_items i ON i.id = pi.item_id
      WHERE pi.user_id = $1 AND pi.quantity > 0
      ORDER BY i.category, i.name`,
    [req.auth!.sub],
  );
  res.json({ items: result.rows });
});

worldRouter.post("/inventory/:itemId/use", async (req, res) => {
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  if (!/^[a-z0-9_-]{1,64}$/i.test(itemId)) {
    res.status(400).json({ error: "Mã vật phẩm không hợp lệ." });
    return;
  }

  const userId = req.auth!.sub;
  try {
    const rateAllowed = await hit(`world-item-use-rate:${userId}`, 3, 10);
    if (!rateAllowed) {
      res.status(429).json({ error: "Bạn sử dụng vật phẩm quá nhanh." });
      return;
    }

    // Only consume offerings at their server-defined interaction point.
    const presence = await redis.hgetall(`presence:${userId}`);
    const position = [Number(presence.x), Number(presence.y), Number(presence.z)];
    const presenceAt = Number(presence.heartbeatAt);
    if (!presence.region || !Number.isFinite(presenceAt) || Date.now() - presenceAt > 30_000 ||
        position.some((value) => !Number.isFinite(value))) {
      res.status(409).json({ error: "Không xác định được vị trí hiện tại. Hãy kết nối lại thế giới." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const itemResult = await client.query<{ id: string; name: string; category: string; metadata: { useTargetId?: string } }>(
        "SELECT id, name, category, metadata FROM world_items WHERE id = $1 FOR SHARE",
        [itemId],
      );
      const item = itemResult.rows[0];
      if (!item || item.category !== "offering" || !item.metadata?.useTargetId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Vật phẩm này không thể sử dụng tại đây." });
        return;
      }

      const target = getWorldInteraction(item.metadata.useTargetId);
      if (!target || !isNearWorldInteraction(position as [number, number, number], presence.region, target.id)) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Bạn cần đứng gần đúng địa điểm để sử dụng vật phẩm." });
        return;
      }

      const inventory = await client.query<{ quantity: number }>(
        "SELECT quantity FROM player_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE",
        [userId, itemId],
      );
      if (!inventory.rows[0] || inventory.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Bạn không có vật phẩm này trong túi đồ." });
        return;
      }
      if (inventory.rows[0].quantity === 1) {
        await client.query("DELETE FROM player_inventory WHERE user_id = $1 AND item_id = $2", [userId, itemId]);
      } else {
        await client.query(
          "UPDATE player_inventory SET quantity = quantity - 1, updated_at = now() WHERE user_id = $1 AND item_id = $2",
          [userId, itemId],
        );
      }
      await client.query("COMMIT");
      res.json({ itemId, consumed: 1, targetId: target.id, message: `Bạn đã dâng ${item.name.toLowerCase()} tại ${target.name}.` });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    // Redis is required for authoritative, fresh online position checks.
    if (error instanceof Error && "code" in error) {
      res.status(503).json({ error: "Dịch vụ thế giới tạm thời không sẵn sàng." });
      return;
    }
    throw error;
  }
});
