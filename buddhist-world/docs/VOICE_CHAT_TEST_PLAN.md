# Voice chat manual verification

Automated CI can typecheck and build the voice client and server, but it cannot prove microphone permissions, device routing, NAT traversal, or real-time speech quality. Use two real browser sessions and separate networks before declaring production-ready.

| Test | Procedure | Expected result |
|---|---|---|
| Permission | Press Bật mic; grant permission | Mic becomes ready but remains muted |
| Push-to-talk | Hold V, speak, release | Audio transmits only while held; release mutes immediately |
| Touch PTT | Press and hold the HUD button | Same behavior as V; pointer cancel/focus loss mutes |
| Speaking indicator | Speak, pause, then remain silent | Nearby peers see indicator turn on/off |
| Per-player volume | Set one peer to 0%, another to 50% | Only selected peer's received audio changes |
| Proximity | Walk beyond 35 m and return | Connection closes outside range and is negotiated again inside |
| Region/disconnect | Change region, disconnect, reconnect | Old-region speaking state clears and peers refresh |
| Cross-network | Use two different ISP/NAT paths with Coturn | Both directions connect; relay candidate is selected when required |
| Permission denied | Deny mic permission | No audio is sent; a clear status is shown |
| Mobile | Test iOS Safari and Android Chrome | Permission, hold gesture and playback work without stuck mic |

Record browser/OS, network type, selected ICE candidate pair, packet loss, RTT and whether TURN relay was used. Do not use localhost-only testing as evidence of cross-network readiness.
