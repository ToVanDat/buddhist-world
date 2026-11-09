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
The Socket.IO Redis adapter forwards room broadcasts (chat and world interaction events) between gateway instances. Each gateway creates dedicated Redis publisher/subscriber connections and waits for them before accepting traffic. Player socket ownership is claimed with a per-user Redis lease (`socket-owner:<userId>`) and a random owner token; Lua compare-and-set checks guard heartbeat, presence writes, and disconnect cleanup so an old gateway cannot delete or overwrite a replacement owner's state. The adapter's server-side event disconnects the previous socket across gateways. Validated position/yaw/animation snapshots are written to `presence:<userId>` at a maximum of 10 Hz and indexed by `presence-region:<regionId>`; each gateway builds its local recipients' interest lists from batched Redis reads at the configured world tick rate. A reconnect can restore a fresh same-region Redis snapshot before falling back to PostgreSQL checkpoint data. Stale region-set members are pruned when snapshots are read, and presence/ownership leases expire after 30 seconds if a gateway crashes. The integration suite now starts two gateway instances and exercises cross-instance chat, remote movement/animation visibility, duplicate-account socket handoff, position restoration, and owner-key cleanup. This is a first distributed-state implementation, not a completed scaling certification: the movement simulation remains local to the current owner and Redis is its replicated snapshot; Redis read/write volume, lease races under high concurrency, reconnect storms, and load behavior still require stress testing. Keep multi-instance deployment behind a controlled staging test until the new CI run passes and load tests establish safe limits.

## Art pipeline status
The procedural Blender generator creates initial interaction props and a rigid-part monk guide rig with an idle clip. Game Y-up coordinates are converted to Blender Z-up before GLB export. These assets are validation-ready base meshes, not final hero assets: final topology, sculpting, texture baking, skinning quality, facial rig, dialogue gestures, audio, and in-game visual review remain required.
