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

Run `pnpm db:migrate` only after reviewing the SQL and taking an appropriate database backup. Do not edit already-applied migrations in an environment that tracks their filenames; create a new migration for later schema changes.

## Endpoints
- `GET /api/world/quests`
- `POST /api/world/quests/:questId/accept`
- `POST /api/world/quests/:questId/abandon`
- `GET /api/world/inventory`
- `POST /api/world/inventory/:itemId/use`
- `GET /api/world/events?limit=30`

The offering action currently supports the seeded `incense_bundle` at `incense_burner`. It consumes one item atomically. Other item effects, trading, player-to-player gifting, and economy rules are intentionally not inferred from client payloads.

## Multiplayer scaling boundary
The Socket.IO Redis adapter forwards room broadcasts (chat and world interaction events) between gateway instances. Each gateway creates dedicated Redis publisher/subscriber connections and waits for them before accepting traffic. Player socket ownership is claimed with a per-user Redis lease (`socket-owner:<userId>`), a random owner token, and a monotonically increasing epoch allocated atomically by Lua. The owner token fences heartbeat, presence writes, and disconnect cleanup; the epoch is persisted in `player_locations.owner_epoch` so a delayed SQL write from an older gateway cannot overwrite a newer owner's checkpoint, even if its timestamp is later. Apply migration `004_socket_owner_fencing.sql` before deploying this version. The adapter's server-side replacement event re-checks the current Redis owner before evicting sockets, preventing out-of-order concurrent-login notifications from disconnecting the winning socket. Validated position/yaw/animation snapshots are written to `presence:<userId>` at a maximum of 10 Hz and indexed by `presence-region:<regionId>`; each gateway builds local recipients' interest lists from batched Redis reads at the configured world tick rate. A reconnect can restore a fresh same-region Redis snapshot before falling back to PostgreSQL checkpoint data. Stale region-set members are pruned when snapshots are read. The owner/presence lease duration defaults to 30 seconds and can be shortened in tests with `SOCKET_OWNER_LEASE_MS`; crashed owners expire without requiring graceful shutdown.

The integration suite starts a second Gateway in a separate Node.js process and covers cross-process chat/movement, concurrent same-account logins, stale socket writes/disconnects, Redis command-connection loss, hard process crash, lease expiry, and reconnect. A repeatable six-client baseline emits state at 10 Hz across two processes while collecting 20 Hz snapshot throughput and inter-snapshot p50/p95. This is a regression baseline, not a capacity ceiling: larger staged load ramps, reconnect storms, Redis saturation and production telemetry still need evaluation. Keep multi-instance deployment disabled until the latest CI run passes, migration 004 is reviewed and applied in a backed-up staging database, and higher-concurrency load tests establish safe limits.

## Art pipeline status
The procedural Blender generator creates initial interaction props and a rigid-part monk guide rig with an idle clip. Game Y-up coordinates are converted to Blender Z-up before GLB export. These assets are validation-ready base meshes, not final hero assets: final topology, sculpting, texture baking, skinning quality, facial rig, dialogue gestures, audio, and in-game visual review remain required.
