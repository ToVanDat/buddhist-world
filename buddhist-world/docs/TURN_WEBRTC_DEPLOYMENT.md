# TURN / WebRTC deployment — Buddhist World

## Status

TURN is intentionally not configured for Buddhist World yet. The project must first pass the current runtime stabilization work. Once approved, Buddhist World will use a dedicated VPS and a separate Coturn deployment. Do not reuse Student-Manager's hostname, IP, realm, certificate, VPS, or shared secret.

## Target service contract

| Setting | Buddhist World target |
|---|---|
| TURN DNS name | `turn-bw.smartsmanage.com` |
| Public host | Dedicated new VPS (not provisioned in this phase) |
| STUN/TURN listener | UDP and TCP `3478` |
| TURN-over-TLS listener | TCP `5349` |
| UDP relay range | Initial proposal `49160-49200`, validate against expected concurrency |
| Realm | `turn-bw.smartsmanage.com` |
| Authentication | Coturn REST API (`use-auth-secret`) |
| Credential lifetime | `600` seconds initially; backend-controlled |
| Shared secret | Unique Buddhist World secret, stored only in server-side secret storage |

These are design targets, not evidence that DNS, VPS, Coturn, firewall, or TLS currently exists or is operational. Do not create DNS records, provision infrastructure, or change production as part of source-code normalization.

## Application environment

After the dedicated TURN host has been provisioned and independently verified, set the following in the Buddhist World **server-side** `.env` or deployment secret manager:

```dotenv
TURN_URLS=turn:turn-bw.smartsmanage.com:3478?transport=udp,turn:turn-bw.smartsmanage.com:3478?transport=tcp,turns:turn-bw.smartsmanage.com:5349?transport=tcp
TURN_SHARED_SECRET=<unique Buddhist World Coturn static-auth-secret>
TURN_CREDENTIAL_TTL_SEC=600
```

Keep `TURN_URLS` and `TURN_SHARED_SECRET` empty in local/staging environments until the corresponding TURN service is ready. The secret must match the dedicated Coturn `static-auth-secret` exactly. Never put it in this document, a tracked file, frontend code, or any `VITE_*` variable. Do not copy or retrieve the Student-Manager secret.

The backend endpoint `GET /api/voice/ice-servers` requires an authenticated session. It creates the REST username as `<expiry-unix-timestamp>:<user-id>` and computes the credential using HMAC-SHA1, as expected by Coturn REST authentication. Responses are marked `Cache-Control: no-store`. When the secret or TURN URLs are absent, the endpoint returns STUN-only configuration.

## Network requirements for the future dedicated TURN host

When infrastructure deployment is separately approved:
- Allow UDP/TCP `3478`.
- Allow TCP `5349` only when the TLS listener and certificate are configured.
- Allow the selected UDP relay range (initial proposal `49160-49200`) in both host and provider firewalls.
- Restrict relay destinations; disallow loopback, link-local, multicast, and other prohibited peer ranges.
- Disable the Coturn CLI on public interfaces.
- Use a valid certificate whose SAN includes `turn-bw.smartsmanage.com`.
- Ensure Coturn can read its certificate and private key.
- Configure monitoring for allocation count, bandwidth, CPU, memory, packet loss, and failed allocations.

## Verification checklist

1. Confirm the dedicated VPS and DNS record belong only to Buddhist World.
2. Verify Coturn is active and listening on the configured UDP/TCP and TLS ports.
3. Verify firewall rules and relay range at both VPS and provider level.
4. Verify Coturn has `use-auth-secret`, the dedicated realm, and the Buddhist World-only secret.
5. From an authenticated staging session, call `GET /api/voice/ice-servers`; confirm the configured ICE URLs and timestamped credentials without logging the secret.
6. Test real WebRTC calls from two independent networks and confirm ICE selects a `relay` candidate when direct connectivity is unavailable.
7. Validate TLS certificate chain and hostname for `turns:turn-bw.smartsmanage.com:5349`.
8. Test expiry, invalid credentials, reconnect, and TURN outage behavior.

A successful API response or STUN-only connection does not prove TURN relay works. Student-Manager and its existing TURN deployment must remain untouched.
