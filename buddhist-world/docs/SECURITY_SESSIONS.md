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
