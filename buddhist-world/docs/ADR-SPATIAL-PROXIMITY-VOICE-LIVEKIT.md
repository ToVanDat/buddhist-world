# ADR: Spatial Proximity Voice with self-hosted LiveKit SFU

- Status: Accepted; first code integration increment implemented, release verification pending.
- Date: 2026-11-16
- Scope: Buddhist World multiplayer voice.

## Context

Buddhist World is a persistent 3D Buddhist world, not a social calling product. Voice must be part of the world: nearby players speak naturally, distance and direction affect what a player hears, and activities such as meditation, Dharma talks and ceremonies apply different speaking policies.

The previous implementation used browser-to-browser WebRTC mesh, custom Socket.IO SDP/ICE signaling and optional standalone Coturn credentials. That path has been replaced in the current feature branch by LiveKit-based media.

## Decision

Use **Spatial Proximity Voice + self-hosted LiveKit SFU**.

- LiveKit is the media plane: microphone publication, SFU forwarding, reconnect and media transport.
- Buddhist World backend is authoritative for region, fresh player positions, proximity, activity policy, permissions, mute and moderation.
- Socket.IO remains the gameplay control plane for movement, presence and compact voice peer/permission events. It does not relay SDP, ICE candidates or audio.
- The browser uses `livekit-client` to publish a microphone track only after explicit user action.
- The browser uses Web Audio API `PannerNode` for spatial direction and distance attenuation.
- The server uses `livekit-server-sdk` to issue short-lived room-scoped tokens and reconcile subscriptions. API keys and secrets remain server-side.
- No voice call UI, dialer, standalone social voice rooms or voice-only friend calling is introduced.

## Implemented world voice behavior

1. **Proximity (default):** same-region players within the configured radius (currently 35 m) are eligible. Each listener receives at most the nearest 8 peers.
2. **Spatial audio:** remote microphone tracks are positioned using authoritative world coordinates; Web Audio handles directional panning and distance attenuation.
3. **Microphone:** browser permission is requested only after explicit action. The track is published muted; push-to-talk uses V or the UI control.
4. **Region change:** the old LiveKit room is disconnected; voice must be reconnected in the new region.
5. **Subscription authorization:** the backend reconciles room subscriptions and sends each publisher the allowed nearby listener identities. The publisher applies LiveKit track subscription permissions; LiveKit enforces the permission for each published track. A modified publisher can still choose to share its own track more broadly, so the server event and client implementation are not a defense against a malicious publisher.

## Future activity policies

- **Meditation:** quiet mode; player microphones muted/denied unless an authored activity explicitly grants permission.
- **Dharma talk:** designated host/speaker/moderator can publish; participants listen by default. Moderators can grant a speaking turn.
- **Ceremony:** role- and event-based speaking policy.
- **Party activity:** Party membership may influence activity policy, but does not create a separate social voice room.

These policies require integration with world activity and moderation data; they are not yet complete.

## Authorization and proximity model

- Authenticate the application session before issuing a LiveKit token.
- Resolve current region and fresh position from server-owned Redis presence; do not accept arbitrary room names, region IDs, positions or roles from the client.
- Use a deterministic opaque region room name. Only the backend mints room-scoped tokens.
- Tokens have a short TTL, allow microphone publication only, and disallow data publication.
- Clients connect with selective subscription (`autoSubscribe: false`).
- The backend computes the allowed listener graph from fresh same-region positions and reconciles LiveKit subscriptions at a bounded cadence.
- Each publisher receives a server-derived listener identity list and applies LiveKit track subscription permissions. A listener cannot manually subscribe to a track when the publisher's LiveKit permission denies it.
- Region changes, stale presence and disconnects remove stale subscription permissions. Activity policies, blocks and moderation must be incorporated before production release.

## Transport and TURN

LiveKit uses WebRTC for browser media transport and its own signaling. This decision removes the custom peer-to-peer mesh and custom Socket.IO SDP/ICE signaling; it does not remove ICE/NAT traversal.

Do not deploy standalone Coturn by default. First test LiveKit's supported self-hosted ICE/UDP/TCP/TLS configuration on real networks. If restrictive NAT/firewalls prevent reliable connectivity, configure LiveKit's supported TURN/TLS or relay capability. Do not issue application-managed TURN credentials or retain the old `/api/voice/ice-servers` endpoint.

## Deployment boundaries

- Self-host LiveKit as a separate media service; do not run it inside the Node API process.
- Local development uses pinned LiveKit server image `v1.13.11`, loopback-bound media ports and development-only `devkey/secret` credentials.
- Production must use TLS/WSS, server-only API credentials, explicit firewall rules, health checks and resource monitoring.
- No audio recording or transcription is in scope.

## Data and migration policy

- No microphone audio is stored in PostgreSQL, Redis or object storage.
- No new database migration is required for the initial voice transport.
- Do not edit applied migrations, reset databases or run migrations as part of this work.
- Historical migration files are preserved; old runtime P2P signaling and TURN credential paths are removed from the application.

## Implementation status

- [x] Server-only LiveKit configuration and short-lived token endpoint.
- [x] Authoritative proximity subscription reconciliation.
- [x] Browser P2P-to-LiveKit migration and Web Audio spatialization.
- [x] Local self-hosted LiveKit development service.
- [x] Proximity radius and nearest-peer policy tests.
- [ ] Activity-specific speaking policies and moderation revocation.
- [ ] Cross-network/mobile/load tests and production deployment validation.

## Acceptance criteria

- No custom SDP/ICE signaling events remain in Socket.IO.
- No application-managed TURN credential endpoint remains.
- Microphone permission is requested only after explicit player action; default is muted.
- A player can publish only a microphone source using the app-minted token.
- A listener receives only tracks allowed by the publisher's LiveKit track permission and the server-provided nearby peer list.
- Region change and stale presence remove stale subscriptions.
- Audio is spatialized and attenuated; per-player volume works.
- Socket.IO movement, presence, chat and Party flows remain independent of LiveKit.
- Cross-network and mobile tests pass before production rollout.
