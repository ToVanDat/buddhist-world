# Online world systems

## Current gameplay loop
- Players authenticate and join a region through Socket.IO.
- The server validates movement and writes a short-lived Redis presence hash containing the latest accepted region and coordinates.
- World interactions are resolved against the shared server-side registry; client text, target position, reward, and cooldown values are never authoritative.
- Interacting with the guide NPC returns quest offers available to that player. Quest acceptance and abandonment are authenticated REST actions.
- Quest progress is updated in a database transaction after a validated interaction. Completion rewards are inserted into the player's inventory in the same transaction.
- The inventory supports offering items only when their database metadata points to a known interaction target and the player's Redis presence is fresh and within range.
- Validated world interactions are broadcast to the region and appended to `world_events` for the activity journal.

## Database migrations
Migrations are additive and are not executed by feature code. The migration runner applies sorted, unapplied SQL files:
1. `001_init.sql`
2. `002_player_location_yaw.sql`
3. `002_world_content.sql`
4. `003_world_events.sql`
5. `004_player_state_version.sql`
6. `004_socket_owner_fencing.sql`
7. `005_world_achievements.sql`
8. `006_npc_daily_schedules.sql`
9. `007_npc_branching_dialogue.sql`

Run `pnpm db:migrate` only after reviewing the SQL and taking an appropriate database backup. Do not edit already-applied migrations in an environment that tracks their filenames; create a new migration for later schema changes.

## Endpoints
- `GET /api/world/quests`
- `POST /api/world/quests/:questId/accept` (NPC-linked quests require a fresh online presence near the assigned NPC)
- `POST /api/world/quests/:questId/abandon`
- `GET /api/world/inventory`
- `POST /api/world/inventory/:itemId/use`
- `GET /api/world/events?limit=30`
- `GET /api/world/npcs?regionId=temple_complex`
- `POST /api/world/npcs/:npcId/dialogue/choice` (choice IDs only; server validates proximity and persists per-player state)

NPC-linked quest acceptance is also checked against fresh Redis presence and the server-side NPC interaction radius, so a direct API call cannot accept a quest from across the map. The offering action currently supports the seeded `incense_bundle` at `incense_burner`. It consumes one item atomically. Checkpoint saves require a fresh Redis presence heartbeat, matching active region, and server-verified distance within 4.5 metres of the requested manifest spawn; an authenticated client cannot save a remote checkpoint by calling the REST endpoint directly. Other item effects, trading, player-to-player gifting, and economy rules are intentionally not inferred from client payloads.

## Multiplayer scaling boundary
The Socket.IO Redis adapter forwards room broadcasts (chat and world interaction events) between gateway instances. Each gateway creates dedicated Redis publisher/subscriber connections and waits for them before accepting traffic. Player socket ownership is claimed with a per-user Redis lease (`socket-owner:<userId>`), a random owner token, and a monotonically increasing epoch allocated atomically by Lua. The owner token fences heartbeat, presence writes, and disconnect cleanup; the epoch is persisted in `player_locations.owner_epoch` so a delayed SQL write from an older gateway cannot overwrite a newer owner's checkpoint, even if its timestamp is later. Apply migration `004_socket_owner_fencing.sql` before deploying this version. The adapter's server-side replacement event re-checks the current Redis owner before evicting sockets, preventing out-of-order concurrent-login notifications from disconnecting the winning socket. Validated position/yaw/animation snapshots are written to `presence:<userId>` at a maximum of 10 Hz and indexed by `presence-region:<regionId>`; each gateway builds local recipients' interest lists from batched Redis reads at the configured world tick rate. A reconnect can restore a fresh same-region Redis snapshot before falling back to PostgreSQL checkpoint data. Stale region-set members are pruned when snapshots are read. The owner/presence lease duration defaults to 30 seconds and can be shortened in tests with `SOCKET_OWNER_LEASE_MS`; crashed owners expire without requiring graceful shutdown.

The integration suite starts a second Gateway in a separate Node.js process and covers cross-process chat/movement, concurrent same-account logins, stale socket writes/disconnects, Redis command-connection loss, hard process crash, lease expiry, and reconnect. The integration suite includes a staged 10/25/50/100-client ramp across two Node.js Gateway processes. Each stage holds all active clients, emits movement at 10 Hz, and records snapshot cadence p50/p95, Redis PING latency, Redis CPU/memory/command/network counters, and per-Gateway process CPU/RSS deltas. The ramp is a controlled CI/staging baseline, not a universal capacity ceiling: production-like geographic latency, reconnect storms, longer soak tests, and Redis failover still require separate evaluation.

### CI load-ramp baseline

Latest verified run: GitHub Actions #523, Ubuntu runner, Node.js 22, PostgreSQL 16, Redis 7. Each stage lasted 3 seconds; all 100 clients remained connected and emitted movement at 10 Hz across two Gateway processes.

| Concurrent clients | Snapshot events/sec | Snapshot interval p50/p95 | Redis PING p95 | Redis CPU (one-core %) | Redis commands/sec |
|---:|---:|---:|---:|---:|---:|
| 10 | 100 | 100 / 101 ms | 1.17 ms | 1.93% | 958 |
| 25 | 250 | 100 / 101 ms | 1.39 ms | 3.49% | 2,186 |
| 50 | 500 | 100 / 104 ms | 1.10 ms | 5.46% | 4,353 |
| 100 | 1,000 | 100 / 106 ms | 2.30 ms | 10.17% | 8,182 |

At 100 clients, Redis network throughput was approximately 11.98 MB/s inbound and 23.06 MB/s outbound. The primary Node process (Vitest harness plus in-process Gateway) used 47.57% of one CPU core and 161.5 MB RSS; the isolated second Gateway used 31.00% of one core and 148.5 MB RSS. These figures are short-run CI observations, not production capacity commitments or a validated safe player limit. Do not extrapolate linearly beyond 100 clients. Keep multi-instance deployment disabled until the latest CI run passes, migration 004 is reviewed and applied in a backed-up staging database, and higher-concurrency load tests establish safe limits.

## NPC daily schedule foundation

The server now contains a deterministic, pure schedule resolver in
`apps/server/src/modules/world/npcSchedule.ts`. Schedule windows use world-clock
minutes (0–1439), are start-inclusive/end-exclusive, support midnight rollover,
and carry the authoritative region, position, heading, activity and optional
dialogue identifier. Invalid entries, duplicate IDs and overlapping windows
are rejected. Unit tests cover boundaries, overnight windows and invalid data.

The resolver is now backed by additive migration `006_npc_daily_schedules.sql` and the `Asia/Ho_Chi_Minh` world clock. The Gateway refreshes schedule rows from PostgreSQL at a low rate, resolves the current minute every second, and broadcasts a region-scoped `world:npcs:state` event only when an NPC's authoritative state changes. A client actor consumes these snapshots and smoothly interpolates to the new scheduled anchor; the client does not supply the NPC time or position.

The NPC actor and patrol route are lightweight procedural placeholders. They
provide deterministic waypoint movement and replicated state, but do not replace
a final skinned character rig, navmesh pathfinding, collision avoidance or authored
animation clips.

## NPC daily schedule API

Migration `006_npc_daily_schedules.sql` adds a JSONB daily schedule to
`world_npcs` and seeds the guide NPC with morning prayer, daytime guidance,
evening walk and night rest states. The schedule resolver rejects malformed,
overlapping or duplicate entries. The authenticated endpoint
`GET /api/world/npcs?regionId=temple_complex` resolves the current state using
the shared `Asia/Ho_Chi_Minh` world clock; the host machine timezone is not used.
Schedule windows are start-inclusive/end-exclusive and can cross midnight.

This endpoint exposes authoritative NPC state (region, position, heading,
activity and dialogue key). The Gateway refreshes authored schedule rows from PostgreSQL every 30 seconds,
then resolves the patrol position from the Vietnam-local clock at one-second
precision. Optional waypoint polylines are traversed deterministically at a
bounded metres-per-second speed and reverse at route endpoints. Region snapshots
are broadcast only when the resolved NPC state changes; newly joined players
receive the latest cached snapshot. The same resolved position updates server
interaction checks, dialogue proximity and NPC-linked quest acceptance, so the
visual actor cannot drift away from its authoritative interaction point.
The client smoothly interpolates position and heading and applies a lightweight
procedural gait to walk states. The fallback guide remains for databases that
have not yet added the schedule column. This is deterministic waypoint patrol,
not navmesh pathfinding: obstacle avoidance, route replanning, final skinned
character rigs and authored sit/pray/work animation clips remain future work.

Apply migration 006 only after reviewing it and backing up the target database.
Feature code does not execute migrations.


## Branching NPC dialogue

Migration `007_npc_branching_dialogue.sql` adds an authored JSONB dialogue graph
to NPC records and `player_npc_dialogue_state` for each player's current node,
boolean flags, unlocked quest IDs and choice history. The guide's opening
conversation offers distinct exploration and temple-practice paths. Choices are
validated against the server-authored graph, checked against fresh same-region
Redis presence and the active scheduled NPC position, then persisted in a
transaction protected by a per-player/NPC advisory lock.

The Gateway loads the player's saved node when the NPC is interacted with.
`POST /api/world/npcs/:npcId/dialogue/choice` accepts only node and choice IDs;
the server resolves the next node, records flags/history and returns quests
unlocked by that branch. The client displays server-provided choices and quest
offers; it cannot submit arbitrary dialogue text, flags, rewards or quest IDs.
The legacy linear dialogue remains available when migration 007 is not present.

Migration 007 is additive and has not been applied to a live database. Apply
migrations 006 and 007 in order only after SQL review and a verified backup.

## Art pipeline status
The procedural Blender generator creates initial interaction props and a rigid-part monk guide rig with an idle clip. Game Y-up coordinates are converted to Blender Z-up before GLB export. These assets are validation-ready base meshes, not final hero assets: final topology, sculpting, texture baking, skinning quality, facial rig, dialogue gestures, audio, and in-game visual review remain required.
