# Spatial Proximity Voice

> Architecture decision accepted on 2026-11-16. The current browser P2P mesh and custom Socket.IO SDP/ICE signaling are legacy implementation and are not the target. LiveKit cutover is pending; do not describe the current voice implementation as LiveKit-ready.

Buddhist World voice is an in-world interaction, not a social calling feature. The target is **Spatial Proximity Voice + self-hosted LiveKit SFU**.

## Responsibilities

- **LiveKit SFU:** transports published microphone audio and forwards subscribed tracks.
- **Game backend:** authoritatively determines region, fresh position, allowed speakers/listeners, activity policy, mute and moderation.
- **Socket.IO:** continues gameplay state, movement, presence and compact voice roster/policy events only. It must not relay SDP, ICE candidates or audio.
- **Browser:** uses `livekit-client` for media and Web Audio API `PannerNode` (or Three.js positional audio integration) for direction and distance attenuation.

## In-world behavior

- Default proximity voice is limited to nearby players in the same region.
- Distance attenuates volume; 3D direction positions the speaker in the sound field.
- Microphone access is requested only after an explicit player action. The microphone starts muted; push-to-talk is supported.
- Per-player local volume, mute, global deafen, permission-denied feedback and reliable cleanup on focus loss/disconnect are required.
- Meditation defaults to quiet/muted behavior.
- Dharma talks use host/speaker permissions; listeners are muted by default.
- Ceremonies use event- and role-based speaking permissions.
- Party membership may influence activity policy but does not create a separate social voice room.

## Authorization

- The backend authenticates the application session before issuing a short-lived LiveKit token.
- The backend resolves current region and position from fresh Redis presence. Never trust a client-provided room name, region, position or role.
- The client connects with selective subscription (`autoSubscribe: false`).
- The backend computes allowed speaker/listener pairs from same-region presence, distance, activity policy, blocks and moderation state, then reconciles LiveKit subscriptions at a bounded cadence.
- Region changes, stale presence, disconnect, mute, block and moderation revocation must remove subscriptions/permissions promptly.
- Client-side attenuation is for presentation, not authorization. The server must prevent unauthorized tracks from being delivered.

## Transport and deployment

LiveKit still uses WebRTC media transport, but replaces the current custom P2P mesh and custom Socket.IO signaling. Do not deploy standalone Coturn by default. First validate LiveKit's supported self-hosted ICE/UDP/TCP/TLS configuration on separate networks. If restrictive NAT/firewalls require it, configure LiveKit's supported TURN/TLS or relay capability. The old `/api/voice/ice-servers` endpoint and application-managed TURN credentials are to be retired after the cutover is complete.

Keep LiveKit separate from the Node API process. Use TLS/WSS, server-only API credentials, explicit firewall rules, health checks and resource monitoring. No audio recording or transcription is in scope.

## Current status

- [x] Architecture decision recorded in `ADR-SPATIAL-PROXIMITY-VOICE-LIVEKIT.md`.
- [ ] LiveKit server configuration and short-lived token endpoint.
- [ ] Authoritative proximity subscription reconciliation.
- [ ] Browser P2P-to-LiveKit migration and Web Audio spatialization.
- [ ] Activity policies, moderation and revocation.
- [ ] Self-host deployment and cross-network/mobile/load QA.

Do not remove the old signaling code until the replacement path is implemented and tested. Do not deploy the new media service to production until cross-network tests pass.
