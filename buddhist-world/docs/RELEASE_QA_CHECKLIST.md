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

- [ ] Decode an open-world token and verify room identity and region are server-derived, publish is microphone-only, canSubscribe remains true for pinned LiveKit 1.13.x compatibility, and token TTL is short.
- [ ] With a modified listener, explicitly request a distant/unapproved track. Verify the publisher's SFU track ACL rejects the request and no audio bytes arrive.
- [ ] With a modified publisher, attempt to widen its own listener ACL. If it succeeds, strict server-authoritative subscription control remains a release blocker.
- [ ] Verify backend RoomServiceClient reconciliation follows the current allowlist; do not treat it as an independent deny boundary while canSubscribe is true.
- [ ] Verify Party tokens are minted only for current Party members and Party-room subscription is isolated from open-world regions.
- [ ] Run two real clients on different ISPs (home broadband and mobile hotspot), then iOS Safari and Android Chrome.
- [ ] Record selected ICE candidate pair, UDP/TCP/TLS path, RTT, packet loss, jitter, reconnect time, SFU CPU/memory/bandwidth and subscription churn.
- [ ] Confirm microphone opt-in, muted-on-publish, push-to-talk release on blur/pointer cancel, device denial, mute and cleanup.
- [ ] No recording, transcription or persistent audio payload.

**Blocking rule:** LiveKit self-hosted 1.13.x has an open upstream issue where RoomService UpdateSubscriptions does not work for participants with canSubscribe=false (https://github.com/livekit/livekit/issues/4651; proposed fix https://github.com/livekit/livekit/pull/4701 is unmerged). Current code uses publisher-applied SFU track ACLs from the backend allowlist. This protects against a modified listener but does not stop a modified publisher from widening its own ACL. Keep open-world voice disabled for production until this publisher-side trust gap is closed by an upstream fix, a reviewed SFU patch, or an alternative server-enforced room partitioning design.

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
