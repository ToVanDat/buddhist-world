# ADR: Spatial Proximity Voice with self-hosted LiveKit SFU

- Status: Accepted architecture decision; implementation is pending.
- Date: 2026-11-16
- Scope: Buddhist World multiplayer voice.

## Context

Buddhist World is a persistent 3D Buddhist world, not a social calling product. Voice must feel like part of the world: nearby players can speak naturally, distance and direction affect what a player hears, and activities such as meditation, Dharma talks and ceremonies apply different speaking policies.

The current implementation uses browser-to-browser WebRTC mesh, Socket.IO SDP/ICE signaling, a proximity roster and optional standalone Coturn credentials. This is not the target architecture and must be replaced incrementally without disturbing gameplay Socket.IO.

## Decision

Use **Spatial Proximity Voice + self-hosted LiveKit SFU**.

- LiveKit is the media plane: microphone audio publication, SFU forwarding, reconnect and media transport.
- Buddhist World backend is the authority for world presence, region, proximity, activity policy, permissions, mute and moderation.
- Socket.IO remains the gameplay control plane for movement, presence, Party/community/chat/notifications and small voice-policy/roster events. It must not relay SDP, ICE candidates or audio.
- The browser uses `livekit-client` to publish a microphone track only after explicit user action and to receive authorized nearby tracks.
- The browser uses Web Audio API `PannerNode` (or Three.js positional audio integration) to spatialize each remote voice. Gain is computed from authoritative player positions and the configured radius; client volume controls are applied locally.
- The server uses `livekit-server-sdk` to issue short-lived room-scoped access tokens and manage rooms/participant permissions/subscriptions. API keys and secrets remain server-side.
- No voice call UI, dialer, standalone social voice rooms or voice-only friend calling is introduced.

## World voice policies

1. **Proximity (default):** players in the same world region can hear only players within the configured proximity radius. Audio is attenuated by distance and spatialized by direction.
2. **Meditation:** quiet mode; player microphones are muted by policy unless an explicitly authored activity grants permission.
3. **Dharma talk:** designated host/speaker/moderator can publish; participants listen by default. A moderator may grant a speaking turn.
4. **Ceremony:** role- and event-based speaking policy, with the same world spatial context.
5. **Party activity:** Party membership can influence policy and activity coordination, but does not automatically create a separate social voice room.

Policy is evaluated server-side. A client-provided room name, region, position, role or permission is never trusted.

## Authorization and proximity model

- Authenticate the application session before issuing a LiveKit token.
- Resolve the player's current region and fresh position from server-owned Redis presence; do not accept arbitrary room names or client-supplied coordinates as authority.
- Use a deterministic region room namespace. Only the backend may mint room-scoped tokens.
- Connect with selective subscription (`autoSubscribe: false`). The backend computes the allowed listener-to-speaker graph from fresh same-region presence, distance, activity policy, blocks and moderation state, then reconciles LiveKit track subscriptions through the Room Service API.
- On region change, stale presence, disconnect, mute, block or moderation action, remove subscriptions/permissions promptly.
- Apply bounded update cadence, nearest-speaker limits, rate limits and stale-state expiry. Do not query LiveKit or PostgreSQL on every movement packet.
- The backend must verify that only audio microphone tracks are eligible for spatial voice subscriptions.

Selective subscription is a bandwidth and privacy boundary. Tests must verify that a client receives no unauthorized audio tracks after a region/proximity/policy change. Do not rely solely on client-side muting or volume attenuation as access control.

## Transport and TURN

LiveKit uses WebRTC for browser media transport. This decision removes the custom peer-to-peer mesh and custom Socket.IO signaling; it does **not** imply that ICE/NAT traversal disappears.

Do not deploy a separate Coturn service by default. First test LiveKit's supported self-hosted ICE/UDP/TCP/TLS configuration on real networks. If restrictive NAT/firewalls prevent reliable connectivity, configure LiveKit's supported TURN/TLS or relay capability as part of the LiveKit deployment. Do not issue application-managed TURN credentials from the old `/api/voice/ice-servers` endpoint.

## Deployment boundaries

- Self-host LiveKit as a separate media service; do not put it inside the Node API process.
- Expose only required signaling/media ports and document firewall rules for the chosen deployment mode.
- Configure public client URL, internal service URL where applicable, API key and API secret through server-only environment variables.
- Use TLS/WSS for public client connections.
- Add health checks, resource limits, structured logs and monitoring for participant count, packet loss, RTT, reconnects and subscription churn.
- Do not deploy to production until cross-network, mobile and load tests pass.

## Data and migration policy

- No microphone audio is stored in PostgreSQL, Redis or object storage.
- Do not record or transcribe voice in this scope.
- Prefer no new database tables for the first increment. Store persistent world policy/configuration only if a real authoring requirement cannot be represented by existing world/activity configuration.
- Do not edit applied migrations, reset databases or run migrations as part of this work.
- Historical TURN settings and old migration files are not deleted; remove their runtime use only after the replacement is complete and tested.

## Implementation sequence

1. Fix the current Party/Community CI failure and retain the existing data-safe migration boundary.
2. Add server-only LiveKit configuration validation, token endpoint and participant permission/policy service.
3. Add authoritative proximity subscription reconciliation driven by Redis presence at a bounded cadence.
4. Replace browser mesh voice with LiveKit client connection, explicit microphone opt-in, push-to-talk, mute/deafen and track cleanup.
5. Route each remote audio track through Web Audio spatial panning, distance attenuation and per-player local volume.
6. Add Party/activity voice policies, moderation actions and disconnect/revocation handling.
7. Add self-hosted LiveKit development/deployment configuration and operational documentation.
8. Add unit/integration tests, browser tests and two-network NAT tests; only then retire the old mesh signaling and ICE credential path.

## Acceptance criteria

- No custom SDP/ICE signaling events remain in Socket.IO after cutover.
- No standalone Coturn credential endpoint is used.
- Microphone permission is requested only after explicit user action; default is muted.
- A player cannot publish when the current activity policy denies speaking.
- A player receives only allowed nearby audio tracks; region switch and policy revocation remove stale subscriptions.
- Audio is spatialized by position and attenuated by distance; user mute/deafen and per-player volume work.
- Socket.IO movement, presence, chat and Party flows continue working independently of LiveKit.
- Cross-network and mobile tests pass before production rollout.
