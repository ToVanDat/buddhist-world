# TURN / WebRTC deployment

Buddhist World reuses the existing Coturn service previously configured for Student-Manager. The application does not install or modify Coturn; it generates short-lived TURN REST credentials for authenticated players.

## Existing TURN service contract

| Setting | Value |
|---|---|
| TURN DNS name / realm | `turn.smartsmanage.com` |
| Public host | `157.10.200.241` |
| STUN/TURN listener | UDP and TCP `3478` |
| TURN-over-TLS listener | TCP `5349` |
| UDP relay range | `49160-49200` |
| Authentication | Coturn REST API (`use-auth-secret`) |
| Credential lifetime | `600` seconds (application-generated username expiry) |

The legacy Coturn configuration also uses fingerprint, stale nonce, no loopback peers, no multicast peers, no CLI, and no TCP relay. Preserve those restrictions when maintaining the TURN host.

## Application environment

Set these values in the **server-side** `.env` or deployment secret manager:

```dotenv
TURN_URLS=turn:turn.smartsmanage.com:3478?transport=udp,turn:turn.smartsmanage.com:3478?transport=tcp,turns:turn.smartsmanage.com:5349?transport=tcp
TURN_SHARED_SECRET=<same secret as Coturn static-auth-secret>
TURN_CREDENTIAL_TTL_SEC=600
```

The secret must match Coturn's `static-auth-secret` exactly. The legacy host previously stored it in `/root/turn-shared-secret`; retrieve it on the TURN server through a privileged session and inject it into the application environment without printing it, committing it, or putting it in any `VITE_*` variable. Do not copy the secret into this document or a tracked file.

The backend endpoint `GET /api/voice/ice-servers` requires an authenticated session. It creates the REST username as `<expiry-unix-timestamp>:<user-id>` and computes the credential using HMAC-SHA1, as expected by Coturn REST authentication. Responses are marked `Cache-Control: no-store`. When the secret or TURN URLs are absent, the endpoint returns STUN-only configuration.

## Network requirements on the TURN host

Keep the existing firewall allowances for:
- UDP/TCP `3478`
- TCP `5349` (only when the TLS listener and certificate are configured)
- UDP `49160-49200` (relay range)

The certificate presented on TCP `5349` must include `turn.smartsmanage.com`, and the Coturn process must be able to read its certificate and private key. The prior VPS setup reported a certificate at `/etc/letsencrypt/live/app.smartsmanage.com/fullchain.pem` and `privkey.pem` whose SAN covered the TURN hostname; verify the current certificate and Coturn TLS directives before relying on TURN/TLS.

## Verification checklist

1. On the TURN host, verify the Coturn service is active and listening on UDP/TCP `3478` and TCP `5349`.
2. Verify the relay range `49160-49200/udp` is allowed by UFW and the VPS/network firewall.
3. Verify Coturn has `use-auth-secret`, the expected realm, and the same secret supplied to the Buddhist World backend.
4. From an authenticated Buddhist World session, call `GET /api/voice/ice-servers`; confirm it returns the configured ICE URLs, a timestamped username, and a credential without logging the secret.
5. Test a real WebRTC call from two networks. Confirm ICE reaches `relay` when direct connectivity is unavailable; a successful API response alone does not prove relay connectivity.
6. Test TLS certificate validation for `turns:turn.smartsmanage.com:5349`.

Do not open the Coturn CLI, expose the shared secret to the browser, or treat STUN-only connectivity as proof that TURN relay works.
