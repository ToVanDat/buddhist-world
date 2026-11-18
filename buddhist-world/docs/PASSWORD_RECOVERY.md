# Password recovery

## Flow (mirrors Student-Manager's three-step UX)

1. `POST /api/auth/forgot-password` accepts an email. It always returns the same generic message for existing and unknown accounts.
2. For an existing account, the server generates a cryptographically random six-digit OTP, stores only its SHA-256 hash in Redis, and sends the OTP by email.
3. `POST /api/auth/verify-reset-otp` verifies the OTP. The OTP expires after five minutes and allows at most five attempts. A successful verification atomically consumes the OTP and issues an opaque reset token.
4. `POST /api/auth/reset-password` consumes the reset token once, updates the password using the existing scrypt password hasher, and revokes every active session for the account.

The OTP and reset token are stored in Redis with TTLs. Only hashes of the OTP and reset token are persisted. A new OTP request invalidates the previous OTP and any verified reset token. Redis is required; no local-memory fallback or PostgreSQL migration is used.

## Email provider and environment

Email delivery uses the same Resend provider and environment variable names as Student-Manager. No additional runtime dependency is required.

Set these server-only variables in the root `.env`:

- `RESEND_API_KEY`: Resend API key.
- `RESEND_FROM_EMAIL`: verified sender, e.g. `Buddhist World <no-reply@your-domain.example>`.
- `PASSWORD_RESET_OTP_TTL_SEC`: optional, defaults to 300 seconds (5 minutes; allowed range 60–900).
- `PASSWORD_RESET_TOKEN_TTL_SEC`: optional, defaults to 600 seconds (10 minutes; allowed range 300–1800).

The feature remains non-delivering until both Resend settings are configured. Missing configuration returns the same service-unavailable response for every address and logs a configuration warning. Provider delivery failures keep the generic success response and remove the pending OTP to avoid revealing account existence.

## Operational and security notes

- Never put `RESEND_API_KEY` in a `VITE_*` variable.
- Configure and verify the sender domain with Resend before production use.
- Use HTTPS and `COOKIE_SECURE=true` in production.
- OTP requests are rate-limited by IP and hashed email. OTP verification is rate-limited by IP and capped at five guesses per OTP.
- Reset tokens are one-use, expire after ten minutes by default, and are invalidated when a new OTP is requested.
- Successful password reset revokes all active sessions. Users must sign in again on every device.
- Do not log raw OTPs, reset tokens, or email contents.
