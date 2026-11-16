# Legacy Reuse Integration Plan

Date: 2026-11-16

## Goal

Reuse proven platform capabilities from `ToVanDat/Student-Manager` in Buddhist World without importing student-domain behavior, duplicating existing modules, weakening the current architecture, or copying environment secrets.

Target branch: `feature/legacy-reuse-integration`
Base branch: `feature/phase1-foundation-hardening`

## Guardrails

- Keep Buddhist World's TypeScript/ESM workspace architecture; do not copy the legacy CommonJS backend wholesale.
- Preserve existing PostgreSQL, Redis, JWT, Socket.IO, Redis Adapter, Helmet, Zod, Pino, and cookie-parser integrations. Do not add duplicate dependencies for capabilities already present.
- Do not copy real `.env` files, JWT keys, OAuth secrets, database credentials, mail credentials, WebAuthn secrets, or push private keys.
- Do not run migrations against a user or production database, deploy, merge, rotate secrets, or change live infrastructure as part of this work.
- Keep all new functionality behind explicit configuration and feature flags where appropriate.
- Every new API must use authenticated identity from the server session, validate input with shared schemas, enforce ownership/authorization server-side, and have tests.
- Buddhist World remains a no-combat experience. No combat, PvP, damage, or combat-progression systems are in scope.

## Reuse matrix

| Capability | Legacy evidence | Buddhist World baseline | Decision |
|---|---|---|---|
| PostgreSQL / pg | Legacy API uses `pg` | Already present | KEEP_CURRENT |
| Redis | Legacy API uses Redis client and Redis-backed controls | Already present via `ioredis` | KEEP_CURRENT; adapt patterns only |
| JWT / refresh sessions | Legacy uses JWT and session controls | Access JWT, hashed refresh token rotation, reuse-family revocation already documented | KEEP_CURRENT; audit parity before changes |
| Socket.IO | Legacy initializes Socket.IO | Already present | KEEP_CURRENT |
| Rate limiting | Legacy uses `express-rate-limit` and Redis-backed progressive login protection | Redis Lua rate limiting already documented | ADAPT only if a concrete gap is found |
| Google OAuth | Legacy dependency and environment template include Google OAuth client configuration | Not confirmed in Buddhist World | ADAPT as optional identity provider |
| Passkey / WebAuthn | Legacy includes `@simplewebauthn/server` and RP/origin configuration | Not confirmed in Buddhist World | ADAPT after account/device model review |
| Email delivery | Legacy includes Resend/Nodemailer configuration | Not confirmed in Buddhist World | ADAPT for verification/recovery only |
| Web Push | Legacy includes `web-push` | Not confirmed in Buddhist World | ADAPT after notification preferences and subscription lifecycle exist |
| Friends / block / direct messages | Legacy project has social/chat work; exact current implementation requires source-level verification | Buddhist World social/community is documented as incomplete | REBUILD/ADAPT for player domain; no blind table copy |
| Admin / RBAC | Legacy has role and permission concepts | Buddhist World admin authorization completeness is not confirmed | ADAPT after permission matrix and route audit |
| AI/RAG | Legacy has Ollama/RAG components | Buddhist World knowledge assistant not confirmed | REBUILD domain corpus, retrieval policy, citations and moderation |
| Student academic modules | Student, class, enrollment, GPA, academic workflows | Not relevant to game domain | EXCLUDE |

## Implementation phases

### Phase A — Baseline and compatibility audit
- Re-check current Buddhist World auth, session, Redis, realtime, notification, and permission modules.
- Inspect the exact legacy implementations before porting any algorithm or schema.
- Record API contracts, DB constraints, dependencies, tests, and configuration variables.
- No schema or runtime changes until this audit is complete.

### Phase B — Identity provider extensions
- Add Google OAuth only if the current account model supports safe provider linking.
- Add Passkey/WebAuthn only after defining credential ownership, challenge TTL, origin/RP validation, recovery, and device revocation.
- Keep password authentication and existing refresh-token semantics intact.
- Add tests for account linking conflicts, replay, invalid origin, expired challenge, and revoked sessions.

### Phase C — Player social and notifications
- Define player-domain contracts for friend requests, accepted friendships, blocks, DMs, message history, read state, and notifications.
- Enforce block rules and membership checks on the server, not only in UI.
- Persist messages in PostgreSQL; use Socket.IO for delivery/presence, not as the source of truth.
- Add pagination, idempotency, abuse limits, and moderation hooks.

### Phase D — Administration and content governance
- Define player, moderator, and admin permission matrix.
- Add server-side authorization and audit events for privileged changes.
- Reuse content-management concepts for NPC dialogue, quests, region interactions, and community events; do not import academic entities.

### Phase E — Knowledge assistant
- Build a Buddhist World-specific curated corpus.
- Require source attribution for retrieved teachings and distinguish sourced material from generated explanation.
- Enforce document visibility and admin publishing workflow.
- Do not let the model execute arbitrary SQL or grant itself access to player data.

### Phase F — Verification
- Run workspace typecheck, unit tests, integration tests, and builds.
- Add PostgreSQL/Redis integration coverage for every persistent or realtime feature.
- Test reconnect, multi-client behavior, authorization boundaries, and abuse cases.
- Do not mark features production-ready based on source presence alone.

## Acceptance criteria

- No duplicate runtime dependency is added when Buddhist World already has the capability.
- No legacy student-domain table, route, or permission is imported.
- No existing auth/session/realtime behavior regresses.
- New schema changes are additive, reviewed, and tested against an isolated test database.
- Every new privileged or user-owned operation has negative authorization tests.
- The feature branch remains separate from the base branch until reviewed and explicitly merged.

## Current status

- [x] Created isolated integration branch from `feature/phase1-foundation-hardening`.
- [x] Compared legacy API package manifest and environment template with Buddhist World workspace manifests and architecture/status documentation.
- [x] Identified existing dependencies that must not be duplicated.
- [ ] Complete file-by-file source audit of legacy OAuth, WebAuthn, email, push, social, and RBAC implementations.
- [ ] Implement and test approved feature slices in dependency order.
