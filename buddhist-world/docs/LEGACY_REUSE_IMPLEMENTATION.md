# Legacy Reuse Integration Plan

Date: 2026-11-16

## Goal

Reuse only the proven platform and social/community patterns from `ToVanDat/Student-Manager` in Buddhist World without importing student-domain behavior, duplicating existing modules, weakening the current architecture, or copying environment secrets.

Target branch: `feature/legacy-reuse-integration`
Base branch: `feature/phase1-foundation-hardening`

## Confirmed scope

IN SCOPE:
- Player friend requests and friendship lifecycle.
- Player blocking/unblocking and server-side enforcement.
- Persistent direct conversations and message history.
- Read cursors/read receipts.
- In-app notifications.
- Gameplay parties (designed separately from group chat).

EXPLICITLY OUT OF SCOPE:
- AI, RAG, Ollama, embeddings, chatbot or knowledge assistant.
- Passkey, WebAuthn and security-key credential flows.
- Google OAuth or other identity-provider changes in this Social & Community phase.
- Student academic modules and data.
- Combat, PvP, damage and combat progression.

## Guardrails

- Keep Buddhist World's TypeScript/ESM workspace architecture; do not copy the legacy CommonJS backend wholesale.
- Preserve existing PostgreSQL, Redis, JWT, Socket.IO, Redis Adapter, Helmet, Zod, Pino and cookie-parser integrations. Do not add duplicate dependencies for capabilities already present.
- Do not copy real `.env` files, JWT keys, OAuth secrets, database credentials, mail credentials, WebAuthn secrets or push private keys.
- Do not run migrations against a user or production database, deploy, merge, delete data, rotate secrets or change live infrastructure as part of this work.
- Every new API derives player identity from the authenticated server session, validates input with shared schemas, enforces ownership/authorization server-side and has tests.
- PostgreSQL is the source of truth for durable social state. Redis is for ephemeral presence, coordination and rate limits. Socket.IO is delivery/notification transport, not persistence.
- Do not create duplicate account, session, presence, regional-chat or notification infrastructure without proving a gap.

## Reuse matrix

| Capability | Buddhist World baseline | Decision |
|---|---|---|
| PostgreSQL / pg | Already present | KEEP_CURRENT |
| Redis | Already present via ioredis | KEEP_CURRENT; adapt patterns only |
| JWT / refresh sessions | Existing access JWT and hashed refresh-token rotation | KEEP_CURRENT |
| Socket.IO | Existing gateway and Redis Adapter | KEEP_CURRENT; add scoped events only |
| Validation / logging / security middleware | Zod, Pino and Helmet already present | KEEP_CURRENT |
| Friends / friend requests | No complete player friend lifecycle verified in Buddhist World; legacy evidence is not sufficient to claim a complete friend-request module | BUILD player-domain state machine |
| Block / report | Legacy conversation service includes block/report checks | ADAPT rules, revalidate transactionally for player UUIDs |
| Direct/group conversations | Legacy routes/services support direct and group conversations | ADAPT domain patterns; do not copy numeric-ID CommonJS code |
| Persistent messages | Legacy service supports history, pagination, edit/recall/delete/reactions | ADAPT only the needed Buddhist World contract |
| Read state | Legacy exposes conversation read operation | ADAPT as monotonic member read cursor |
| Notifications | Legacy has notification history/preferences and Web Push endpoints | BUILD in-app notifications first; Web Push deferred |
| Gameplay party | Legacy group chat is not a gameplay party | BUILD separate party domain |
| Google OAuth / Passkey / WebAuthn | Not required for this phase | EXCLUDE |
| AI/RAG | Not required and explicitly prohibited in this scope | EXCLUDE |
| Student academic modules | Not relevant to game domain | EXCLUDE |

## Implementation phases

### Phase A — Source and schema audit
- Completed initial source comparison; see `docs/SOCIAL_COMMUNITY_SOURCE_AUDIT.md`.
- Inventory every Buddhist World migration and inspect current auth, profile, realtime and UI patterns before SQL/code changes.
- Inspect legacy repository/SQL behavior where needed; treat source as reference, not as a drop-in module.
- Confirm final entity names, foreign keys, unique constraints and indexes before authoring migrations.

### Phase B — Friends and blocks
- Implement friend request state transitions, list/follow-up operations and block/unblock.
- Enforce self-action rejection, duplicate/race safety, account state and block rules.
- Add API, shared Zod contracts and authorization tests.

### Phase C — Persistent direct messages
- Add durable direct conversations, membership and message records.
- Add cursor pagination, idempotency and bounded message payloads.
- Persist in PostgreSQL before Socket.IO delivery; recover history from REST after reconnect.
- Add monotonic read cursors/read receipts.

### Phase D — In-app notifications
- Add recipient-scoped notification history, unread counts and read operations.
- Use Socket.IO for prompt delivery; PostgreSQL remains canonical.
- Web Push is deferred and is not a prerequisite for this phase.

### Phase E — Gameplay parties
- Implement party membership, invitation lifecycle, leader transfer, capacity and disconnect semantics separately from group conversations.
- Apply friendship/block/online/region policy on the server.

### Phase F — UI and verification
- Add social UI after API contracts stabilize.
- Run workspace typecheck, unit tests, isolated PostgreSQL/Redis integration tests and production builds.
- Test unauthorized access, blocked users, duplicate/racing requests, pagination, idempotency, reconnect and multi-client delivery.

## Acceptance criteria

- No duplicate runtime dependency is added when Buddhist World already has the capability.
- No legacy student-domain table, route or permission is imported.
- No AI/RAG or Passkey/WebAuthn code, dependency, configuration, route or migration is introduced.
- No existing auth/session/realtime behavior regresses.
- New schema changes are additive and reviewed against the full migration inventory.
- No migration is applied to a user or production database as part of this work.
- Every user-owned operation has negative authorization tests.
- The feature branch remains separate from the base branch until reviewed and explicitly merged.

## Current status

- [x] Created isolated integration branch from `feature/phase1-foundation-hardening`.
- [x] Compared legacy and Buddhist World backend architecture and dependencies.
- [x] Audited legacy conversation/message routes and service behavior.
- [x] Audited Buddhist World auth, REST mount points, initial schema, shared socket contracts and realtime gateway.
- [x] Explicitly excluded AI/RAG, Passkey/WebAuthn and identity-provider changes from this phase.
- [ ] Complete full migration inventory and inspect existing UI/test conventions.
- [ ] Implement Friends + Block slice.
- [ ] Implement persistent DMs + read cursors.
- [ ] Implement in-app notifications.
- [ ] Implement gameplay parties separately from group chat.
