# HTTPS local development (Nginx + mkcert)

This reproduces the local HTTPS topology previously used for Student-Manager, adapted to Buddhist World:

- Browser: `https://buddhist-world.local`
- Nginx in Ubuntu WSL2: TLS termination on :443; HTTP :80 redirects to HTTPS
- Vite: `127.0.0.1:5173`
- Express + Socket.IO: `127.0.0.1:3001`
- Postgres / Redis remain on their existing local Docker ports

This is a **local development configuration**, not a production deployment. It does not reuse the old `student-manager.local` certificate: that certificate does not contain `buddhist-world.local` in its SAN and browsers will reject it for this hostname.

## 1. Create a certificate in WSL

Run in Ubuntu WSL2 (mkcert must already be installed):

```bash
mkdir -p ~/buddhist-world-certs
mkcert -cert-file ~/buddhist-world-certs/buddhist-world.local.pem \
  -key-file ~/buddhist-world-certs/buddhist-world.local-key.pem \
  buddhist-world.local localhost 127.0.0.1 ::1

sudo mkdir -p /etc/nginx/certs
sudo install -m 644 ~/buddhist-world-certs/buddhist-world.local.pem /etc/nginx/certs/
sudo install -m 600 ~/buddhist-world-certs/buddhist-world.local-key.pem /etc/nginx/certs/
```

Because the browser runs on Windows while Nginx/mkcert run in WSL2, WSL's mkcert CA is **not automatically trusted by Windows**. Export only the public root certificate:

```bash
mkdir -p /mnt/c/Users/ADMIN/buddhist-world-certs
cp "$(mkcert -CAROOT)/rootCA.pem" /mnt/c/Users/ADMIN/buddhist-world-certs/
```

On Windows, open `certmgr.msc` → **Trusted Root Certification Authorities** → **Certificates** → Import, and import:
`C:\Users\ADMIN\buddhist-world-certs\rootCA.pem`.

Never copy or share `rootCA-key.pem`; it is the local CA private key.

## 2. Configure Windows hostname

Open Notepad as Administrator and edit:
`C:\Windows\System32\drivers\etc\hosts`

Add:

```text
127.0.0.1 buddhist-world.local
```

If WSL2 localhost forwarding is disabled in the machine's networking setup, configure the existing WSL2 port-forwarding policy separately; do not expose the dev ports publicly.

## 3. Install the Nginx site in WSL2

From the repository root in WSL:

```bash
sudo cp infra/nginx/buddhist-world.local.conf.example /etc/nginx/sites-available/buddhist-world
sudo ln -sfn /etc/nginx/sites-available/buddhist-world /etc/nginx/sites-enabled/buddhist-world
sudo nginx -t
sudo systemctl reload nginx
```

If another default site claims the same hostname, disable only that conflicting site after inspecting it; do not remove unrelated Nginx sites.

## 4. Configure Buddhist World environment

In `buddhist-world/.env`, use these local HTTPS values (keep the existing database, Redis and secret values):

```dotenv
NODE_ENV=development
PORT=3001
CORS_ORIGIN=https://buddhist-world.local
COOKIE_SECURE=true
```

The refresh cookie remains HttpOnly and Secure. HTTPS is terminated by Nginx; Express receives the forwarded HTTPS scheme. Do not add TLS certificate paths or private keys to `.env`.

## 5. Start the application

Terminal 1 (WSL2):

```bash
cd /path/to/buddhist-world
pnpm dev:server
```

Terminal 2 (WSL2; enable the Vite HMR WSS endpoint behind Nginx):

```bash
cd /path/to/buddhist-world
BW_HTTPS_PROXY=1 pnpm dev:web
```

Then open `https://buddhist-world.local` in the Windows browser. Keep Postgres and Redis running as usual with `pnpm infra:up`.

For plain HTTP development, leave `BW_HTTPS_PROXY` unset and continue using `http://localhost:5173`; set `CORS_ORIGIN=http://localhost:5173` and `COOKIE_SECURE=false` in that local environment.

## 6. Verify

```bash
sudo nginx -t
curl -I http://buddhist-world.local
curl -k -I https://buddhist-world.local
curl -k https://buddhist-world.local/api/health/ready
```

Expected: HTTP returns a 301 to HTTPS; the HTTPS page is served by Vite; the readiness endpoint returns the app's healthy response when the database and Redis are ready. The `-k` flag is only for this local diagnostic; the Windows browser should trust the mkcert root and must not show a certificate warning.

Socket.IO should connect through `wss://buddhist-world.local/socket.io`. If the page loads but HMR or multiplayer sockets fail, inspect the Nginx error log and browser Network → WS before changing the application protocol.

## Security boundary

- This config is for local development only; do not copy it into a production server without a separate production deployment review.
- Do not reuse Student-Manager's `student-manager.local` leaf certificate for this hostname.
- Never commit TLS private keys, mkcert CA private keys, production secrets, or a real `.env`.
- Do not expose ports 3001, 5173, 5433 or 6379 to the public network.
