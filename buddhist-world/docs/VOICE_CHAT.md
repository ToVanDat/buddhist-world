# Proximity voice chat

Voice uses browser WebRTC peer connections and Socket.IO only for authenticated signaling and lightweight speaking-state hints. Microphone media is peer-to-peer; the Gateway does not receive, record, or store audio.

## Player controls
- Microphone permission is requested only after the player presses **Bật mic**.
- The microphone remains muted after permission is granted. Hold **V** on desktop or hold the on-screen **Giữ để nói** button on touch devices to transmit. Releasing the key/button, losing window focus, or disabling the microphone immediately mutes the audio track.
- A local Web Audio RMS detector sends only speaking on/off transitions; it does not send audio samples. It is an amplitude heuristic, not speech recognition, and background noise can occasionally trigger it.
- The player list shows nearby voice connections, a speaking indicator, and an independent 0–100% volume slider for each player. The slider gain is multiplied by distance attenuation.
- When a player changes region or disconnects, the Gateway clears their speaking indicator for the old region.

## Proximity and security
- The Gateway publishes a voice-peer roster for players in the same region within 35 metres, capped to the eight nearest players per client to bound mesh bandwidth.
- Every SDP/ICE signal is checked against authenticated socket ownership, fresh Redis presence, region and distance.
- Speaking-state events are accepted only from the authenticated socket owner and rate-limited. Clients display them only for players in their current voice roster.
- The lower user ID initiates each peer connection to avoid simultaneous initial offers.
- Signaling is schema-validated and rate-limited. No audio is persisted.

## Optional Coturn configuration
Set server-side environment variables:
- `TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349`
- `TURN_SHARED_SECRET=<at-least-32-character-secret-shared-with-coturn>`
- `TURN_CREDENTIAL_TTL_SEC=600`

If TURN is not configured, clients fall back to a public STUN server. STUN-only connectivity is not reliable through every NAT/firewall. Production voice requires a reachable TURN service, correct UDP/TCP firewall rules, TLS for TURN/TLS as applicable, and two-network testing. Never put `TURN_SHARED_SECRET` in a Vite `VITE_*` variable.

## Cross-network QA checklist
1. Run two authenticated browser sessions in the same region, each on a separate Internet connection (for example, home broadband and a mobile hotspot).
2. Confirm both users appear in the voice list within 35 metres and can hear one another after granting microphone permission.
3. Confirm neither microphone transmits immediately after enabling; hold **V** / the touch talk button to speak, then release and verify mute is immediate.
4. Confirm speaking indicators appear only while voice activity is detected and clear on silence, region switch, disconnect and reconnect.
5. Move one player beyond 35 metres and verify the peer connection closes; return and verify it is re-established.
6. Change one player's volume slider from 100% to 0% and verify only that speaker is muted locally.
7. Repeat with permission denied, browser tab focus loss, reconnect, and mobile Safari/Chrome.
8. Inspect browser WebRTC stats and Coturn logs; verify relay candidates are selected when direct P2P is blocked.

## Scope and limits
This is proximity voice, not party/channel voice. No recording, transcription, moderation, spatial occlusion or SFU is included. Browser autoplay and mobile permissions still require QA. WebRTC mesh bandwidth grows with nearby peer count; keep the 35 m radius and eight-peer cap until crowded-scene tests justify a change.
