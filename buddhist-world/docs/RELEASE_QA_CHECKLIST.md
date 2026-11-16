# Buddhist World release QA gate

This checklist is a release gate, not a declaration that the checks have passed. Keep PR #8 in Draft until all applicable checks have evidence attached.

## 1. Frontend functional QA

- [ ] Party: create, discover, join, invite, accept/decline, leave, leader handoff and close.
- [ ] Community: create, public join, private request, approve/decline, member list, moderator permissions and leave.
- [ ] Character Creator: load only approved/current assets, apply a valid preset, select starter and owned cosmetics, validate incompatible skeleton/slots, save and reload.
- [ ] Shop: list real active prices, wallet balance, purchase, insufficient funds, idempotent retry and inventory update.
- [ ] Moderation: report intake, queue filters, review/resolution, audit trail, temporary voice mute and unmute.
- [ ] Test empty, loading, API error, schema-not-ready and permission-denied states. No placeholder inventory, users, currency balances or reports.
- [ ] Desktop 1440p/1080p, tablet and mobile; keyboard focus, Escape, focus restoration, reduced motion and touch targets.

## 2. LiveKit security and transport

- [ ] Decode an open-world token and verify canSubscribe=false, room identity and region are server-derived, publish is microphone-only and token TTL is short.
- [ ] With a modified client, explicitly request a distant/unapproved track. Verify the self-hosted LiveKit SFU rejects the request and no audio bytes arrive.
- [ ] Verify backend RoomServiceClient.updateSubscriptions can add an authorized nearby microphone track and remove it when the listener leaves the radius.
- [ ] Verify Party tokens are minted only for current Party members and Party-room subscription is isolated from open-world regions.
- [ ] Run two real clients on different ISPs (home broadband and mobile hotspot), then iOS Safari and Android Chrome.
- [ ] Record selected ICE candidate pair, UDP/TCP/TLS path, RTT, packet loss, jitter, reconnect time, SFU CPU/memory/bandwidth and subscription churn.
- [ ] Confirm microphone opt-in, muted-on-publish, push-to-talk release on blur/pointer cancel, device denial, mute and cleanup.
- [ ] No recording, transcription or persistent audio payload.

**Blocking rule:** if the pinned self-hosted LiveKit v1.13.11 does not reject client-originated subscriptions when canSubscribe=false while allowing backend-managed subscriptions, keep open-world voice disabled. Do not fall back to client-side track permissions as the security boundary.

## 3. Automated realtime soak

The PR workflow runs:
- 50-player simultaneous reconnect storm across two Gateway processes.
- 100 connected simulated players for 30 minutes with per-minute Node/Redis telemetry and tick delivery assertions.

This validates Socket.IO/Gateway/Redis realtime behavior. It is not a LiveKit media-plane soak and does not replace real two-network/browser/mobile tests.

- [ ] Both soak tests complete successfully on the latest PR head.
- [ ] Preserve workflow logs and telemetry artifact; inspect CPU/memory growth, Redis latency, tick delivery, reconnects and single-owner invariants.
- [ ] No unexplained errors, unbounded memory growth or dropped player ownership.

## 4. Release decision

- [ ] Latest production build, unit tests, PostgreSQL + Redis integration tests and browser visual QA pass.
- [ ] All new screens pass functional and responsive browser QA.
- [ ] No unresolved critical/high security findings.
- [ ] Database migration review confirms additive compatibility; do not reset or mutate existing user databases during QA.
- [ ] Deployment config, TLS/WSS, firewall, secrets, backups, rollback and monitoring are reviewed.
- [ ] Release owner explicitly approves merge and deployment in separate steps.

Until every blocking item has evidence, the status is **not production-ready**. No production migration, merge or deployment is implied by this checklist.
