# Security and Session Model

## Access token

- JWT algorithm is HS256 with explicit issuer and audience validation.
- Every access token contains the database session row ID as `sessionId`.
- REST authentication checks that this session belongs to the subject, is not revoked, and has not expired.
- Legacy access tokens without a session ID are rejected and users must refresh/login again after deploying this change.

## Refresh token

- Only a SHA-256 hash of the opaque refresh token is stored.
- Rotation locks the current session row with `SELECT ... FOR UPDATE`, revokes it, and creates the next token in the same transaction.
- Reuse of a revoked token revokes the remaining sessions in that token family.

## Logout and sockets

- Logout revokes the refresh-session row and writes a short-lived Redis revocation marker.
- Socket connections validate their session at handshake and periodically re-check it. Refreshing or revoking a session therefore closes sockets using the previous access token.
- Socket session checks are periodic (5 seconds), not a substitute for a centralized pub/sub revocation system.

## Deployment note

This is a breaking auth-token change. Deploy backend and frontend together, then require users to authenticate again. Do not reuse the previous example JWT secret. Production requires a unique secret and `COOKIE_SECURE=true`.

## Request and realtime throttling

The current application applies layered limits; these values are initial protection ceilings and should be tuned from production telemetry:

| Surface | Scope | Limit |
|---|---|---:|
| REST API | IP | 600 requests / 60 seconds |
| Registration | IP | 10 / hour |
| Login | IP | 20 / 15 minutes |
| Login failures | normalized account identifier (SHA-256 key) | progressive cooldown below |
| Refresh endpoint | IP | 60 / 15 minutes |
| Refresh token | SHA-256 token fingerprint | 10 / 15 minutes |
| Chat message REST API | IP + authenticated account | 60 / 60 seconds + 30 / 60 seconds |
| Voice ICE configuration | authenticated account | 20 / 60 seconds |
| Socket region join | account | 10 / 10 seconds |
| Socket movement | account | 35 / second (client cadence is 25 / second) |
| World interaction | account | 8 / 10 seconds plus target-specific cooldown |
| Socket chat | account | 1 / second and 6 / 10 seconds |
| Voice signaling | account | 40 / 10 seconds |
| Voice activity | account | 24 / 10 seconds |

Progressive login cooldown is based on failed attempts in a 24-hour counter window: 4–5 failures = 30 seconds; 6–7 = 1 minute; 8–9 = 5 minutes; 10–11 = 15 minutes; 12 or more = 30 minutes. A successful login clears the account failure counter and cooldown. The account identifier is normalized and hashed before it is used as a Redis key; raw email addresses are not stored in rate-limit keys.

## Redis outage behavior

- Login account-cooldown checks and failure recording fail closed with HTTP 503 when Redis is unavailable.
- The refresh-token-specific limiter fails closed with HTTP 503.
- In production, the shared REST rate-limit middleware returns HTTP 503 when Redis is unavailable. Development/test mode currently allows generic middleware to continue, but does not bypass the login-specific protection.
- Socket join/state limiter failures disconnect the socket. Chat and voice signaling fail closed with an error or dropped event; no unthrottled relay fallback is used.
- Redis is the shared limiter store across Gateway instances. Do not replace it with per-process counters for production multi-instance deployments.

The dedicated `Buddhist World Realtime Security Soak` workflow runs automatically for pull requests that change realtime, authentication, chat, voice, integration, or shared server library code. It runs the 50-player reconnect storm and the 30-minute / 100-player soak against isolated PostgreSQL and Redis services. These are configured limits, not proof of production capacity; tune them from measured legitimate traffic before rollout.
## WebRTC TURN deployment

The voice ICE endpoint uses the existing Coturn deployment at `turn.smartsmanage.com`. It generates short-lived Coturn REST credentials on the authenticated backend; the shared secret is server-only and must never be exposed through a `VITE_*` variable. See [TURN_WEBRTC_DEPLOYMENT.md](TURN_WEBRTC_DEPLOYMENT.md) for the listener, relay range, TLS, environment, and end-to-end verification contract. The configured ICE URL list and credential TTL do not by themselves prove that TURN relay or TLS is operational.
