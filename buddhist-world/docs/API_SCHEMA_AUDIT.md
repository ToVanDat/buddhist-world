# API / Schema / Business Audit

- Audit ref: `feature/legacy-reuse-integration`
- Base commit: `d7b2449a992905a804c12840efe856ee3fa160fd`
- Implementation branch: `feat/all-api-implementation`
- Scope: all server APIs and persistent business domains
- Safety: source/migration audit only; no user database was connected or modified

## 1. Executive summary

The current backend is a functional foundation and a playable gameplay slice, not a complete persistent-world platform. The current Express app mounts `/api/health`, `/api/auth`, `/api/me`, `/api/world`, and `/api/voice`. Realtime gameplay is handled by Socket.IO. The existing code already implements authentication/session rotation, profile display-name updates, proximity-checked checkpoints, world/NPC/quest/inventory/achievement reads and selected actions, movement/presence, regional ephemeral chat, interaction events, and WebRTC signaling.

The largest missing business domains are persistent chat/DM, friends and blocks, parties/groups, notifications, character creator/catalog/equipment, inventory administration/economy/trading, asset catalog/versioning and delivery, animation/cinematic/VFX/audio content management, region/content administration, moderation and role/permission administration. Several existing domains are only slices: profile has no full account lifecycle; character config can be read but has no character update API; inventory has read/use but no player-facing acquisition/equip/trade APIs; quest acceptance/abandon and interaction progress exist but authoring/admin APIs do not.

**Schema audit limitation:** this report reconstructs the schema from committed migrations and SQL references. It is not a live `information_schema`/catalog inspection of the user's database. Before applying any migration, compare the live database's migration ledger, columns, constraints, indexes, extensions and row counts against this report using read-only SQL.

## 2. Current REST API matrix

| Domain | Existing route / transport | Current behavior | Status | Gaps / next work |
|---|---|---|---|---|
| Health | `GET /api/health`, `GET /api/health/ready` | Process liveness and PostgreSQL/Redis readiness | Implemented | Add dependency latency/version diagnostics only if operationally needed |
| Auth | `POST /api/auth/register`, `login`, `refresh`, `logout` | Password hash, access JWT, HttpOnly refresh cookie, refresh rotation/reuse detection, DB session check, rate limits, audit log | Partial / strong foundation | Password change/reset, email verification, session/device listing and revoke, revoke-all, OAuth/passkey if required; review CSRF/origin policy and session cleanup |
| Authorization | Role claim in JWT; no central permission middleware observed | `users.role` has player/moderator/admin values | Incomplete | Central RBAC/permissions, resource ownership policy, admin audit trail and tests |
| Player profile | `GET /api/me`, `PUT /api/me/profile` | Own profile and character/location summary; update display name | Partial | Avatar/preferences/privacy/settings, account export/deletion policy, profile visibility |
| Character | Read through `GET /api/me` | Reads `player_characters.base_model/config`; default character created on register | Incomplete | Character catalog, body/face/hair/material slots, presets, save/preview/validate, equipment and versioning |
| Checkpoint/location | `PUT /api/me/checkpoint`; realtime autosave | Manifest spawn validation, Redis fresh presence and proximity; location/yaw persistence | Implemented slice | Region discovery/transfer REST contract, checkpoint history/favorites and recovery policy |
| World environment | `GET /api/world/environment`; Socket.IO snapshot | Server time-of-day and env-configured weather | Partial | Admin-authored schedules/weather presets and persisted world-state configuration |
| NPC | `GET /api/world/npcs?regionId=...`; Socket.IO NPC state | Active NPCs and daily schedule snapshot | Partial | NPC CRUD/admin authoring, content validation/versioning, localization |
| Dialogue | `POST /api/world/npcs/:npcId/dialogue/choice`; realtime interaction | Server-authored graph, proximity, per-player state and choice history | Partial | Dialogue authoring/review/localization, graph version migration and admin API |
| Quests | `GET /api/world/quests`, `POST .../:id/accept`, `POST .../:id/abandon`; realtime progress | Player state, NPC proximity/branch unlock, transactionally updated objectives/rewards | Partial | Quest CRUD/publish/versioning, objective types beyond interact, history/claim/retry policies |
| Inventory | `GET /api/world/inventory`, `POST .../:itemId/use` | Own inventory; consumes offering at a server-defined interaction point | Partial | Item catalog/admin, acquire/grant, equip, consume effects, trade/gift, capacity and transaction ledger |
| Achievements | `GET /api/world/achievements`; realtime unlock | Server derives progress from durable world events | Partial | Admin definitions/versioning, categories/rules, reward integration and achievement history |
| Activity journal | `GET /api/world/events?limit=...` | Recent events for current/saved region | Partial | Per-player history, cursor pagination, filters and retention |
| Voice | `GET /api/voice/ice-servers`; Socket.IO signaling/activity/peer roster | Short-lived TURN credentials; proximity-checked WebRTC signaling; media remains peer-to-peer | Implemented slice | Voice moderation/report controls, connection telemetry and real-device/NAT QA |
| Chat | Socket.IO `chat:send` / `chat:message`; new REST `/api/chat` | Regional chat remains ephemeral; new branch adds durable direct/group conversations, message history, idempotent sends, read receipts and soft recall | Partial implementation in this branch; integration verification pending | Realtime conversation delivery, attachments, edit/moderation, group member invite/leave, mute/block/report and notifications |
| Friends / blocks | `/api/social` (new on `feat/all-api-implementation`) | Friend requests, reciprocal auto-accept, friend list/remove, directional block/unblock with block history | Implemented in this branch; CI pending | Add notifications/presence privacy integration and PostgreSQL integration coverage |
| Party / groups | None found | No party/member/leader workflow found | Missing | Create/invite/join/leave/kick/leader transfer, capacity and region constraints |
| Notifications | New `/api/notifications` | In-app inbox, unread count, mark-one/read-all and per-kind in-app preferences; friend/chat events create notifications | Partial implementation in this branch; integration verification pending | Socket delivery, push subscriptions/provider, retention, notification outbox and more event types |
| Asset management | No backend route found | Existing frontend/GLB registry and Blender pipeline are not an asset-management API | Missing | Catalog, immutable versions, storage metadata, publish/review, signed delivery URLs, usage references |
| Animation / cinematic | No backend route found | Client/Blender authoring only; no persisted production job/content API found | Missing | Animation clip catalog, cinematic timelines/sequences, render jobs and status |
| VFX / audio | No backend route found | Client runtime/audio modules only; no content administration API found | Missing | Audio/VFX catalog, variants, licensing/source metadata, event binding and delivery |
| Admin / CMS / moderation | New `/api/admin/users`, `/api/admin/audit-logs`, `PATCH /api/admin/users/:id/role` | Database-backed role check on each request, user search, role changes and audit log; prevents self-demotion | Partial implementation in this branch; integration verification pending | Full permission matrix, moderation/suspension, content CMS, admin actions and audit search hardening |

## 3. Current Socket.IO contract

Observed client events: `region:join`, `player:state`, `chat:send`, `world:interact`, `voice:signal`, `voice:activity`.

Observed server events include: `region:joined`, `world:state`, `player:correct`, `chat:message`, `app:error`, `world:interact:result`, `world:event`, `world:npcs:state`, `world:environment:state`, `voice:peers`, `voice:signal`, `voice:activity`.

Realtime already uses authenticated sessions, Redis-backed single-socket ownership/presence, a Socket.IO Redis adapter, movement validation, spatial interest lookup and server-side world interaction checks. Regional chat is broadcast-only and is not durable: the current payload is created in memory and emitted to a region room. It is not a direct-message/conversation system.

## 4. Schema inventory reconstructed from migrations

| Table | Purpose / observed columns | Assessment |
|---|---|---|
| `schema_migrations` | Applied migration name, checksum, timestamp | Migration ledger; runner adds checksum compatibly |
| `users` | UUID, email, username, password hash, role, created_at | Core identity; case-insensitive unique email/username indexes |
| `player_profiles` | user_id, display_name, updated_at | Minimal profile |
| `player_characters` | user_id, base_model, JSON config, updated_at | One character per user; no normalized creator catalog |
| `player_locations` | user_id, region/spawn, x/y/z; later yaw, state_updated_at, owner_epoch | Current durable location and concurrency fencing |
| `player_sessions` | user_id, family_id, token_hash, expiry, revoke time, user agent | Refresh/session persistence |
| `audit_logs` | actor, action, detail JSON, IP, timestamp | Basic security audit |
| `world_items` | item ID, name/description/category, stack limit, metadata | Small seeded item catalog |
| `player_inventory` | user/item, quantity, acquired/updated times | Stack inventory; no transaction ledger/equipment/trade |
| `world_npcs` | region, name/title, position, legacy dialogue JSON, active; later schedule and dialogue_graph | World content table |
| `world_quests` | NPC, title/description, objectives/rewards JSON, repeatable/active | Seeded quest definitions |
| `player_quests` | user/quest, status, progress JSON, accepted/completed times | Player quest state |
| `world_events` | region, actor, target, interaction kind, timestamp | Append-only interaction journal |
| `world_achievements` | definition, category, target IDs, required count, active | Server-evaluated definitions |
| `player_achievements` | user/achievement/unlocked time | Unique player unlock |
| `player_npc_dialogue_state` | user/NPC, current node, flags, unlocked quest IDs, choice history | Persisted branching dialogue |
| `player_friend_requests` | directional friend request and status history | Added by `009_social_relationships.sql` |
| `player_blocks` | directional block history with soft-unblock timestamp | Added by `009_social_relationships.sql` |
| `player_conversations` | direct/group conversation metadata and canonical direct key | Added by `010_conversations_messages.sql` |
| `player_conversation_members` | membership, owner/member role, leave/read/mute timestamps | Added by `010_conversations_messages.sql` |
| `player_messages` | durable text messages, sender, idempotency key, edit/soft-delete timestamps | Added by `010_conversations_messages.sql` |
| `player_message_receipts` | per-recipient delivered/read timestamps | Added by `010_conversations_messages.sql` |
| `player_notifications` | in-app notification payload, actor, kind, dedupe key, read timestamp | Added by `011_notifications.sql` |
| `player_notification_preferences` | per-user, per-kind in-app notification preference | Added by `011_notifications.sql` |

Migration sequence documented in `docs/WORLD_SYSTEMS.md`: `001_init`, `002_player_location_yaw`, `002_world_content`, `003_world_events`, two additive `004_*` migrations, `005_world_achievements`, `006_npc_daily_schedules`, `007_npc_branching_dialogue`, `008_query_and_fk_indexes`, then this branch's `009_social_relationships`, `010_conversations_messages`, and `011_notifications`. The two 004 files share a numeric prefix; the runner sorts by filename, so preserve the exact filenames and never renumber/rewrite them.

## 5. Existing integrity / compatibility observations

1. The migration runner takes a PostgreSQL advisory lock, runs each unapplied file in a transaction, stores SHA-256 checksums and rejects edits to already-checksummed migrations. New schema must be introduced through new additive migration files.
2. `002_world_content.sql` seeds items, NPC and quests using `ON CONFLICT DO NOTHING`, then adds the offering target metadata. It creates the current gameplay content tables; these are not an independent admin CMS.
3. `004_player_state_version.sql` and `004_socket_owner_fencing.sql` both extend `player_locations`; they are separate migration files and both must remain present.
4. `005`, `006`, and `007` add achievements, NPC schedule and branching dialogue. The feature code has compatibility paths for some older schema states, but release validation must check the actual migration ledger before deployment.
5. JWT contains a role claim. This branch adds `/api/admin` role-level protection that re-reads the role from PostgreSQL per request, but it is not yet a complete permission matrix or resource-scoped authorization system.
6. The current character table stores a JSON document but has no endpoint that validates and updates the full character configuration. A client-side creator UI alone would not make this a complete feature.
7. The current inventory route is intentionally narrow. Do not add economy/trading by mutating quantities from client-provided payloads; all grants, consumption and transfers need transactional server rules and an auditable ledger.
8. At the audited base, no persistent conversation/message schema existed; this branch adds `010_conversations_messages.sql`. Regional Socket.IO chat remains separate and ephemeral until persistent conversation events are wired into the Gateway.
9. This branch adds in-app notifications in `011_notifications.sql`; Web Push subscriptions and delivery are not implemented.
10. No asset metadata, file-version, party, animation, cinematic, VFX or audio-content tables were found in the inspected migrations. Moderation and full CMS remain incomplete.
11. The repository already has migration `008_query_and_fk_indexes.sql`; new work started at `009_` (not `008_`). This branch adds `009_social_relationships.sql`, `010_conversations_messages.sql` and `011_notifications.sql`; future migrations must start at `012_`.
12. Live DB drift remains unverified. The repository's migrations are the intended schema, not proof that the user's local database has applied every migration.

## 6. Implementation order

- **P0 — Audit and safety baseline:** verify migration head and live schema read-only; add route-level integration harness and RBAC design; preserve current auth/session and gameplay contracts.
- **P1 — Core player/account:** session management and account lifecycle; character creator APIs with schema validation and version-safe JSON updates; profile/preferences; region/checkpoint contract.
- **P2 — Durable social:** conversations, messages, direct/group chat, receipts, friend requests, blocks, parties, notifications; add indexes and ownership isolation.
- **P3 — Gameplay completeness:** item catalog/equipment/ledger, quest admin/versioning/objective engine, achievement admin/rewards, event history pagination.
- **P4 — Content platform:** asset catalog/version/review/storage metadata; animation, cinematic, VFX and recorded-audio catalogs; signed delivery and content publish workflow.
- **P5 — Admin/CMS and operations:** RBAC/permissions, moderation, audit search, rate-limit policy, observability and API documentation.
- Every module: migration review -> service/repository/route/schema -> authorization and transaction tests -> integration tests -> typecheck/build -> migration dry-run against a disposable database -> compatibility verification. Never run migrations against the user's working database as part of CI.

## 7. Required live-database read-only verification before migration application

Run against the intended Buddhist World database and retain the output privately:

```sql
SELECT current_database(), current_user, version();

SELECT name, checksum, applied_at
FROM schema_migrations
ORDER BY name;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS table_name, conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

These are read-only queries. Do not run `pnpm db:migrate` until the live output has been compared with the migration chain and a verified backup exists.
