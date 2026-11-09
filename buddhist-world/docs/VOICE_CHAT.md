# Proximity voice chat

Voice uses browser WebRTC peer connections and Socket.IO only for authenticated signaling. Microphone media is peer-to-peer; the Gateway does not receive or record audio.

## Behavior and guardrails
- Microphone permission is requested only after the player presses **Bật mic**. Turning it off disables the audio tracks; leaving the game stops them.
- The Gateway publishes a voice-peer roster for players in the same region within 35 metres. Every SDP/ICE signal is checked against authenticated socket ownership, fresh Redis presence, region and distance.
- The lower user ID initiates each peer connection to avoid simultaneous initial offers.
- Remote audio fades with distance. Peers leaving the 35 m roster are closed.
- Signaling is schema-validated and rate-limited. No audio is persisted.
- TURN credentials are short-lived and minted by authenticated `GET /api/voice/ice-servers` using Coturn REST shared-secret HMAC. The shared secret stays on the server.

## Optional Coturn configuration
Set server-side environment variables:
- `TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349`
- `TURN_SHARED_SECRET=<at-least-32-character-secret-shared-with-coturn>`
- `TURN_CREDENTIAL_TTL_SEC=600`

If TURN is not configured, clients fall back to a public STUN server. STUN-only connectivity is not reliable across every NAT/firewall. Production voice requires a reachable TURN service, correct UDP/TCP firewall rules, TLS for TURN/TLS as applicable, and two-network testing. Never put `TURN_SHARED_SECRET` in a Vite `VITE_*` variable.

## Scope and limits
This is proximity voice, not party/channel voice. No recording, transcription, moderation, push-to-talk, spatial occlusion or SFU is included. Browser autoplay and mobile permissions require QA. WebRTC mesh bandwidth grows with nearby peer count; keep the 35 m radius until crowded-scene tests justify a change.
