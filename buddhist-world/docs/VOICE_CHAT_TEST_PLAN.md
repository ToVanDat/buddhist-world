# Spatial Proximity Voice verification plan

This plan applies to the accepted LiveKit SFU architecture. The current P2P mesh test plan is superseded. LiveKit implementation is not complete until every required test below has been executed against a deployed test SFU.

## Automated tests

| Area | Test | Expected result |
|---|---|---|
| Token | Unauthenticated or expired app session requests a voice token | 401; no LiveKit token is returned |
| Token | User requests a different region/room than authoritative Redis presence | Rejected; client cannot select arbitrary rooms |
| Token | Token is minted | Short TTL, stable user identity, only intended room grants; API secret never reaches browser |
| Policy | Proximity voice with nearby same-region users | Only authorized nearby audio tracks are subscribed |
| Policy | Player moves outside radius or switches region | Server removes stale subscriptions promptly |
| Policy | Stale/missing Redis presence | No subscription is granted; stale voice access is revoked |
| Policy | User is blocked or muted by moderation | Relevant audio access/publication is revoked |
| Activity | Meditation | Default microphone publishing is denied/muted |
| Activity | Dharma talk | Host/speaker can publish; participants listen unless granted a speaking turn |
| Activity | Ceremony | Speaking follows event roles and moderation policy |
| Transport | Participant disconnects or session is revoked | LiveKit participant is removed or permissions are revoked |
| Client | Mic opt-in, push-to-talk, mute, deafen and cleanup | No microphone transmission before explicit action; mute/focus loss/disconnect stop transmission |
| Spatial | Remote player moves around listener | Correct left/right/front/back positioning and distance attenuation |
| Spatial | Local per-player volume set to 0 | Only that speaker is muted locally |
| Gameplay | LiveKit unavailable | Game movement, chat and Party state remain functional |

## Browser and device tests

1. Test two or more authenticated browser sessions, with at least two different Internet connections (home broadband and mobile hotspot).
2. Confirm microphone permission is requested only after pressing **Bật mic** and that the track starts muted.
3. Confirm push-to-talk releases immediately on key-up, pointer-up, pointer-cancel, tab blur and device disconnect.
4. Confirm nearby voices are spatialized and attenuated; moving around the avatar changes direction naturally.
5. Walk beyond the configured radius and verify the server removes the subscription, not merely the local audio element.
6. Change region, disconnect/reconnect, expire/revoke the app session and confirm old media subscriptions are removed.
7. Test permission denied, no microphone device, device switching, browser autoplay restrictions and audio output selection.
8. Test iOS Safari and Android Chrome.
9. Test crowded scenes at the expected maximum participants per region; record SFU CPU, memory, bandwidth, packet loss, RTT, reconnects and subscription churn.
10. Verify no audio recording, transcription or persistent audio payload is created.

## Network and deployment tests

- Validate the documented LiveKit UDP and TCP/TLS connectivity from separate ISPs and restrictive NAT environments.
- Confirm the selected ICE candidate path and relay behavior; do not assume STUN-only connectivity is sufficient.
- Do not add standalone Coturn unless measured network tests prove it is needed and the chosen LiveKit deployment requires it.
- Verify public WSS URL, certificates, firewall exposure, health checks, resource limits and server-only API credentials.
- Never treat localhost-only testing as evidence of cross-network readiness.

## Release gate

Voice is not production-ready until automated tests, browser/device tests, two-network NAT tests and a representative region load test pass. Keep the old implementation isolated during migration; remove its Socket.IO SDP/ICE events and `/api/voice/ice-servers` only in the same reviewed cutover after LiveKit is verified.
