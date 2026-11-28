# Social & Community — Source Audit and Implementation Scope

Date: 2026-11-16
Target branch: `feature/legacy-reuse-integration`

## Scope decision

Implement player Social & Community for Buddhist World only.

Explicitly excluded from this work:
- AI, RAG, Ollama, embeddings, knowledge assistant and chatbot.
- Passkey, WebAuthn and security-key credential flows.
- Google OAuth and other identity-provider changes.
- Student-management academic entities and workflows.
- Combat, PvP, damage and combat progression.

Keep the existing Buddhist World TypeScript/ESM architecture. Do not copy the legacy CommonJS application wholesale. Do not add dependencies for PostgreSQL, Redis, Socket.IO, Socket.IO Redis Adapter, Helmet, Zod, Pino or cookie-parser; they are already present in `buddhist-world/apps/server/package.json`.

## Source evidence: Student-Manager

Inspected source files:
- `students_managerment-api/src/app.js`
- `students_managerment-api/src/server.js`
- `students_managerment-api/router/conversationRouter.js`
- `students_managerment-api/router/messageRouter.js`
- `students_managerment-api/router/userRouter.js`
- `students_managerment-api/router/webPushRouter.js`
- `students_managerment-api/controller/conversationController.js`
- `students_managerment-api/controller/messageController.js`
- `students_managerment-api/controller/userController.js`
- `students_managerment-api/service/conversationService.js`
- `students_managerment-api/service/messageService.js`

Verified reusable domain patterns:
- Direct conversations and group conversations.
- Conversation membership checks and group roles (owner/admin/member).
- Message history with bounded pagination.
- Message editing, recall, per-user deletion, delete-for-everyone and reactions.
- Read-state operation for conversations.
- Blocking checks when opening or sending direct messages.
- Conversation reporting.
- Notification history, read-all/read-one operations, preferences and Web Push subscription endpoints.
- Socket.IO room events for conversation and message updates.

Important limitations in the audit:
- The inspected source establishes conversation/group-chat behavior, not a complete standalone friend-request lifecycle. Buddhist World must define its own friend request state machine.
- A legacy group conversation is not equivalent to a gameplay party. Party membership, leader transfer, invitations and world-presence semantics need a separate player-domain design.
- Legacy numeric user IDs and CommonJS service/repository contracts must not be copied into Buddhist World's UUID-based TypeScript/ESM domain.
- Legacy notification and block logic must be reviewed for Buddhist World privacy, authorization and transactional requirements before adaptation.

## Source evidence: Buddhist World

Inspected source files:
- `buddhist-world/apps/server/package.json`
- `buddhist-world/apps/server/src/index.ts`
- `buddhist-world/apps/server/src/app.ts`
- `buddhist-world/apps/server/src/realtime/gateway.ts`
- `buddhist-world/apps/server/src/modules/auth/requireAuth.ts`
- `buddhist-world/apps/server/src/modules/auth/routes.ts`
- `buddhist-world/apps/server/src/modules/me/routes.ts`
- `buddhist-world/apps/server/src/db/migrate.ts`
- `buddhist-world/apps/server/src/db/migrations/001_init.sql`
- `buddhist-world/packages/shared/src/schemas.ts`
- `buddhist-world/apps/web/src/game/multiplayer/socket.ts`
- `buddhist-world/docs/IMPLEMENTATION_STATUS.md`

Verified baseline:
- PostgreSQL UUID player identity, profiles and durable player sessions already exist.
- Authenticated REST routes use `requireAuth`, access-token claims and active-session validation.
- Socket.IO authenticates the access token and checks the session before connection.
- Socket.IO Redis Adapter is already configured; Redis also owns distributed socket leases and player presence.
- Current regional chat validates and rate-limits messages, then broadcasts them to a region. The inspected handler creates an in-memory message and does not persist it.
- `app.ts` currently mounts health, auth, me, world and voice routers; no social/community router is mounted.
- The inspected initial migration contains users, player_profiles, player_characters, player_locations, player_sessions and audit_logs; it does not define friends, conversations, messages or notifications.
- Shared socket schemas currently define regional chat events, not persistent DM/community contracts.

## Target domain design

Use PostgreSQL as the durable source of truth. Use Redis for ephemeral presence, short-lived coordination and rate limits. Use Socket.IO for delivery and online hints only; never treat socket delivery as persistence.

Proposed additive domain entities (final names and constraints must be reconciled against every existing migration before writing SQL):
- Friend requests / friendships: requester, recipient, state, timestamps; unique pair and legal state transitions.
- User blocks: blocker, blocked user, created timestamp; unique directed pair. Block checks apply to requests, DMs, invitations and party joins.
- Conversations: direct or group, creator/owner and timestamps.
- Conversation members: role, join/leave state and read cursor; unique active membership.
- Messages: sender, conversation, body, client idempotency key, created/edited/recalled timestamps; cursor pagination index.
- Notifications: recipient, actor, type, entity reference, read timestamp and created timestamp; recipient-scoped indexes.
- Gameplay parties: separate from group conversations; owner/leader, members, invite lifecycle, capacity and world/region compatibility.

Do not create a second user/account table, a second session table, a second presence system, or a second regional-chat system.

## Implementation order

1. Complete migration inventory and inspect the legacy repositories/SQL constraints. Confirm no equivalent tables or partial modules exist on the target branch.
2. Implement friend requests, friendship listing and block/unblock first. Enforce ownership, state transitions, unique constraints and block rules in backend transactions.
3. Implement persistent direct conversations and messages with bounded cursor pagination, idempotency and server-side membership checks.
4. Add read cursors/read receipts and reconnect-safe socket notifications. PostgreSQL commits before emitting events.
5. Add in-app notification center with unread count and read operations. Web Push is not part of the initial slice.
6. Implement gameplay party separately from group chat, with explicit invite, leader and disconnect semantics.
7. Add UI after API contracts stabilize.

## Security and integrity acceptance

- Never accept the acting player ID from request bodies; derive identity from authenticated claims.
- Reject self-friend, self-block, self-DM and invalid state transitions.
- Enforce blocks symmetrically where policy requires, including direct messages, friend requests and party invitations.
- Every conversation read/write checks current membership in the same transaction or query boundary.
- Use UUIDs consistently and parameterized SQL.
- Use unique constraints/idempotency keys to make concurrent requests safe.
- Use cursor pagination with stable ordering; do not use unbounded message reads.
- Store read state as a monotonic cursor/timestamp; never trust a client-supplied arbitrary recipient ID.
- Persist before emitting Socket.IO events; reconnect clients recover from REST/DB state.
- Rate-limit friend requests, messages, searches and invitations with the existing Redis rate-limit utility.
- Add negative authorization tests, duplicate/race tests, block enforcement tests, pagination tests and multi-client/reconnect tests.

## Change safety

- No migration has been run.
- No production database, deployment, secrets or repository settings have been changed.
- No merge to the base branch has been performed.
- New SQL must be additive and reviewed against the complete migration inventory before implementation.
- AI/RAG and Passkey/WebAuthn are explicitly out of scope for this branch's Social & Community implementation.
