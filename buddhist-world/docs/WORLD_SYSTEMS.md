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
The current gateway still owns authoritative player movement in a process-local map. Redis presence and interaction cooldowns are shared, but that does **not** make movement replication multi-instance safe. Before horizontal scaling, add and test the Socket.IO Redis adapter, cross-instance authoritative player state/ownership, reconnect handoff, and load tests. Do not run multiple game gateway instances behind a load balancer yet.

## Art pipeline status
The procedural Blender generator creates initial interaction props and a rigid-part monk guide rig with an idle clip. Game Y-up coordinates are converted to Blender Z-up before GLB export. These assets are validation-ready base meshes, not final hero assets: final topology, sculpting, texture baking, skinning quality, facial rig, dialogue gestures, audio, and in-game visual review remain required.
