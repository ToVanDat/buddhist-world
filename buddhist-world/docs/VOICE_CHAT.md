# Spatial Proximity Voice

Buddhist World voice is an in-world interaction, not a social calling feature. The target and current implementation direction is **Spatial Proximity Voice + self-hosted LiveKit SFU**.

## Architecture

- **LiveKit SFU:** transports microphone audio and forwards only subscribed tracks.
- **Game backend:** owns region presence and positions in Redis, computes nearby listeners, issues short-lived room-scoped tokens and reconciles SFU subscriptions.
- **Socket.IO:** sends gameplay state, nearby speaker IDs and server-authorized listener identity lists. It does not relay SDP, ICE candidates or audio.
- **Browser:** uses `livekit-client` and Web Audio API `PannerNode` for 3D direction and distance attenuation.
- **Room namespace:** one opaque LiveKit room per world region, plus Party-specific rooms for active Party activities. The client cannot choose the room or identity; the token endpoint resolves both from authenticated session, fresh server-owned presence and Party membership.

## In-world behavior

- Default proximity voice is limited to players in the same world region and within the configured radius (currently 35 m).
- The server limits each listener to the nearest 8 voice peers.
- Distance attenuates volume; the browser spatializes direction using the listener's world position and yaw.
- Microphone access is requested only after an explicit player action. The mic is published muted; hold **V** or the push-to-talk control to speak.
- Per-player local volume, mute, disconnect and cleanup are supported.
- Changing world region disconnects the old LiveKit room; the player reconnects to the new region's voice.
- No voice call UI, dialer, standalone social voice rooms or voice-only friend calling.

## Subscription authorization

- The backend authenticates the application session and checks fresh Redis presence before minting a short-lived LiveKit token.
- The backend derives room and identity; client-supplied room, region, position and identity are ignored.
- Tokens permit microphone source publication only, no data publication, and a short TTL.
- The client connects with `autoSubscribe: false`.
- The backend reconciles subscriptions through LiveKit RoomService using fresh same-region positions. This keeps the server's current subscription set aligned but is not treated as a separate deny boundary while the participant has canSubscribe=true.
- The backend sends each open-world publisher the authoritative list of nearby listener identities. The publisher applies LiveKit setTrackSubscriptionPermissions(false, ...); this ACL is enforced by the SFU, so a modified listener cannot override another publisher's ACL merely by calling setSubscribed(true).
- Open-world tokens keep canSubscribe=true because self-hosted LiveKit 1.13.x has an upstream issue where RoomService UpdateSubscriptions fails for participants with canSubscribe=false (https://github.com/livekit/livekit/issues/4651; proposed fix https://github.com/livekit/livekit/pull/4701 is unmerged).
- Party activity uses a server-derived Party room. All current Party members may hear one another; on membership changes the backend removes former members from the active room.
- The browser subscribes only to the server-provided nearest voice peers in open world. Client-side gain and panning are presentation, not access control.
- When the player moves, changes region, disconnects or presence becomes stale, subscription permissions and SFU subscriptions are reconciled.

Publisher-side track permissions are enforced by LiveKit, but a modified/compromised publisher client could widen the ACL for its own microphone track. This is a known gap if strict server-authoritative subscription control is required. Self-hosted LiveKit does not invalidate an already-issued token on participant removal, so the app uses a short token TTL (60-second example default) and checks Party membership on every token request. Keep production voice gated until the publisher trust gap is closed by an upstream fix, a reviewed SFU patch, or an alternate server-enforced room partitioning design.

## Local development

1. Copy `.env.example` to `.env`.
2. Keep the development-only LiveKit values:
   - `LIVEKIT_INTERNAL_URL=http://localhost:7880`
   - `LIVEKIT_PUBLIC_URL=ws://localhost:7880`
   - `LIVEKIT_API_KEY=devkey`
   - `LIVEKIT_API_SECRET=secret`
3. Start infrastructure with `pnpm infra:up`. The local compose file starts PostgreSQL, Redis and LiveKit.
4. Install workspace dependencies with `pnpm install` so the pnpm lockfile is synchronized with the new LiveKit packages.
5. Start server and web using the existing project scripts.

The development LiveKit config binds media ports to loopback. It is not suitable for remote players or production.

## Production deployment boundary

- Self-host LiveKit separately from the Node API process.
- Use a pinned LiveKit server image, TLS/WSS public URL, server-only API key/secret and a private backend-to-LiveKit URL.
- Expose only the required signaling and media ports. Configure UDP/TCP/TLS and firewall rules for the actual network topology.
- Do not deploy standalone Coturn by default. LiveKit uses WebRTC/ICE internally; validate restrictive NAT/firewall environments before deciding whether LiveKit's supported TURN/TLS or relay capability is needed.
- No microphone recording or transcription is in scope.
- Add monitoring for participants, packet loss, RTT, reconnects, subscription churn, CPU, memory and network usage.

## Current implementation status

- [x] Server-side LiveKit token endpoint bound to authenticated current world presence.
- [x] Region-scoped room naming and microphone-only publish grants.
- [x] LiveKit RoomService-based proximity subscription reconciliation.
- [x] Backend-computed publisher listener lists and SFU-enforced LiveKit track subscription permissions (with modified-publisher residual risk documented).
- [x] Party-room membership reconciliation and eviction of former members; short token TTL bounds stale-token rejoin window.
- [x] Browser P2P mesh replaced by LiveKit client.
- [x] Web Audio 3D panning, distance model and per-player gain.
- [x] Local LiveKit development service and config in Docker Compose.
- [x] Unit tests for proximity radius and nearest-peer cap.
- [ ] Verify CI after the LiveKit integration commits.
- [ ] Add meditation, Dharma talk and ceremony-specific speaking policies.
- [x] Moderation voice mute/unmute integration and app-session checks.
- [ ] Complete server-authoritative subscription control against a modified publisher.
- [ ] Cross-network NAT, mobile Safari/Chrome and crowded-region load tests.
- [ ] Production TLS/firewall/monitoring deployment and operational runbook.

Do not describe voice as production-ready until the remaining tests and activity/moderation policies pass.


## Activity microphone policy (server enforced)

- Open world: spatial proximity microphone is available after explicit player action.
- Meditation: listen-only; microphone publishing is disabled by the token grant.
- Dharma talk and guided tour: only the Party leader/host may publish; members are listeners.
- Ceremony: only the Party leader/host may publish by default.
- World visit: Party members may publish.
- Party voice tokens use a server-derived Party room; clients cannot choose the Party or room. When Party schema is not installed, token issuance falls back to the open-world room and does not query missing Party tables.
- Client UI also disables the microphone button when the server token says `canPublish=false`; this is UX reinforcement, not a replacement for SFU authorization.
