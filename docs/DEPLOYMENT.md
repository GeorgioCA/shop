# Deployment

The platform is one Node process with one SQLite database and one uploads directory. There is no build step, no worker, no cron, and no required third party.

## Requirements

- Docker with Compose v2 (recommended), or Node ≥ 22.5 with `npm ci --omit=dev`.
- One persistent volume mounted at `/data`.
- A domain with TLS. The app trusts one proxy hop (`trust proxy = 1`), so run it behind Caddy, Nginx, Traefik or a platform proxy.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `PUBLIC_BASE_URL` | yes | Absolute origin used in emails, Stripe returns, canonical URLs and the sitemap. No trailing slash. |
| `SESSION_SECRET` | yes | HMAC key for admin sessions and customer logins. `openssl rand -hex 32`. Rotating it signs everyone out. |
| `DATA_DIR` | yes | SQLite + uploads. Use `/data` in Docker. |
| `PORT` | no | Default `3000`. |
| `TRUST_PROXY` | no | Reverse-proxy hops in front of the app. Default `1`. `true` trusts the immediate connection; a comma-separated IP/CIDR list is also accepted. This drives `req.ip` (rate limiting) and the secure-cookie check. |
| `STRIPE_SECRET_KEY` | no | Enables Stripe Checkout once the Card payments module is on. |
| `STRIPE_WEBHOOK_SECRET` | with Stripe | Signing secret for `/api/stripe/webhook`. |
| `STRIPE_AUTOMATIC_TAX` | no | `1` enables Stripe Tax on sessions. |
| `RESEND_API_KEY` | no | Transactional email. Without it, mail is logged as skipped and **customer account registration is disabled** (sign-up is confirmed with an emailed link). |
| `RESEND_API_URL` | no | Override the Resend API endpoint (self-hosted, proxied or test installs). |
| `EMAIL_FROM` | no | Fallback sender; Settings → Email overrides it. |
| `PAYMENTS_DEMO` | no | `1` simulates successful card payments. Never in production — the admin shows a warning banner while it is on. |

Business identity, branding, modules, products, services, content and payment behaviour are configured in `/admin`. They are deliberately **not** environment variables.

If `SESSION_SECRET` is missing, the app generates `data/.session-secret` and warns. That works for a single container but breaks if you run more than one replica — which you should not, because SQLite and uploads assume one writer.

## Docker Compose

```sh
cp .env.example .env
# edit PUBLIC_BASE_URL and SESSION_SECRET
docker compose up -d --build
docker compose logs -f web
```

The compose file passes the environment explicitly. Adding a variable only to `.env` does nothing unless it is listed under `environment:`.

## Reverse proxy

Caddy:

```
shop.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name shop.example.com;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

`client_max_body_size` must be at least 8 MB for image uploads.

## First run

1. Open `https://shop.example.com/setup`.
2. Create the owner account (name, email, password ≥ 10 chars with a letter and a number).
3. Pick an industry preset in `/admin/setup`, or start blank.
4. Set business details, upload a logo, adjust colours.
5. Add products/services and edit the homepage in Pages.
6. Press **Finish setup**.

`/setup` redirects to the login page once a user exists.

## Stripe

1. Add `STRIPE_SECRET_KEY` and restart.
2. Admin → Modules → enable **Card payments**.
3. Admin → Settings → Orders & payments → enable **Accept card payments**.
4. Add the webhook `https://shop.example.com/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`; put its signing secret in `STRIPE_WEBHOOK_SECRET` and restart.
5. Test with a Stripe test key and a test card before switching to live keys.

Orders are marked paid only when `payment_status === "paid"`. Refunds are manual in Stripe; the admin has a "Mark refunded" action that records the state but does not move money. Unpaid card orders older than 48 hours are cancelled at boot, and reserved stock is returned.

## Email

1. Verify a sending domain with Resend.
2. Set `RESEND_API_KEY`; set the from address in Admin → Settings → Email (it must be on the verified domain).
3. Set the owner alert address to receive new orders, bookings and inquiries.

Email failures are logged in `email_log` and never block a sale. Without a key, every message is recorded as `skipped`.

## Backups

Everything that matters is in `DATA_DIR`:

- `store.db` (plus `-wal` / `-shm` while running)
- `uploads/`
- `.session-secret` (optional; rotating it just signs users out)

Use SQLite's own snapshot, never `cp` on a live WAL database:

```sh
docker compose exec web node -e "
  const {DatabaseSync}=require('node:sqlite');
  new DatabaseSync('/data/store.db').exec(\"VACUUM INTO '/data/backups/'||date('now')||'.sqlite'\");
"
docker compose cp web:/data/backups ./backups
docker compose exec web tar czf /tmp/uploads.tgz -C /data uploads
```

Or from the host:

```sh
docker run --rm -v shop-data:/data -v "$PWD:/out" alpine \
  sh -c 'apk add --no-cache sqlite && sqlite3 /data/store.db "VACUUM INTO '\''/out/store-$(date +%F).sqlite'\''" && tar czf /out/uploads-$(date +%F).tgz -C /data uploads'
```

Restore:

```sh
docker compose down
docker run --rm -v shop-data:/data -v "$PWD:/in" alpine \
  sh -c 'rm -f /data/store.db* && cp /in/store-2026-01-01.sqlite /data/store.db && tar xzf /in/uploads-2026-01-01.tgz -C /data'
docker compose up -d
```

Check integrity with `PRAGMA integrity_check` before restoring, and keep at least one off-site copy.

## Upgrades

```sh
git pull
docker compose up -d --build
```

Schema migrations are forward-only and run at boot (`PRAGMA user_version` + guarded `ALTER TABLE`). Nothing is dropped automatically. Back up before a major upgrade.

If a release adds an environment variable, it is added to `docker-compose.yml` in the same commit; copying only `.env` is not enough.

## Operations

- `GET /health` → `{ "ok": true, "schema": 1 }`. Use it for the container health check and uptime monitoring.
- Logs go to stdout; the request id on errors (`X-Request-Id`) matches the log line.
- The app keeps small in-process rate-limit buckets for login, checkout, booking, contact and newsletter. They reset on restart; that is acceptable for a single-business site.
- `audit_log` records admin sign-ins and every configuration/entity change with user, entity and IP.
- One replica only. SQLite allows one writer; running two containers against the same volume will corrupt nothing but will produce lock errors and stale caches. Scale vertically.

## Security checklist

- `SESSION_SECRET` set, long and random.
- HTTPS terminated at the proxy; cookies become `Secure` automatically via `X-Forwarded-Proto`.
- `/setup` shows the login page after the first user exists.
- Admin users created per person, not shared; `owner` only where needed.
- Stripe keys live in the environment, never in the database or admin UI.
- Uploads are re-encoded and capped at 8 MB; SVG logos are sanitised.
- Backups stored off the host.
