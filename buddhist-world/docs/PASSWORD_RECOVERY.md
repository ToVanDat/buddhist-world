# Password recovery

## Flow

- `POST /api/auth/forgot-password` accepts an email and always returns the same generic success response, whether or not the account exists.
- When an account exists and email delivery is configured, the server generates a 256-bit random opaque token. Only its SHA-256 digest is stored in Redis with a short TTL.
- The email link places the token in the URL fragment (`#reset=...`) so browsers do not send it in the HTTP request or Referer header.
- `POST /api/auth/reset-password` atomically consumes the Redis token with `GETDEL`, validates the new password, updates the password hash and revokes all active player sessions.
- A reset token is single-use and expires after `PASSWORD_RESET_TTL_SEC`. Redis must be available; no local-memory fallback is used.

## Email provider and environment

Email delivery uses the Resend HTTP API; no client-side secret or extra runtime dependency is required.

Set these server-only variables in the root `.env`:

- `RESEND_API_KEY`: Resend API key.
- `PASSWORD_RESET_EMAIL_FROM`: verified sender, e.g. `Buddhist World <no-reply@your-domain.example>`.
- `APP_BASE_URL`: public frontend origin, e.g. `https://your-game-domain.example`.
- `PASSWORD_RESET_TTL_SEC`: optional, defaults to 1800 seconds (30 minutes; allowed range 300–3600).

The feature intentionally remains non-delivering until all three email settings are configured. Missing configuration returns the same service-unavailable response for every address and logs a configuration warning; it does not reveal account existence. Provider delivery failures keep the generic success response and remove the pending token.

## Operational notes

- Do not put the Resend API key in a `VITE_*` variable.
- Configure the sender domain and verify it with Resend before production use.
- Use HTTPS and `COOKIE_SECURE=true` in production.
- Password reset revokes all active sessions for the account. Users must sign in again on every device.
- Tokens are not stored in PostgreSQL and no database migration is required; Redis TTL is the expiry mechanism.
- Monitor provider delivery failures and Redis availability. Do not log raw reset tokens or reset URLs.
