# Shop Platform

A configurable business platform for a **single business per installation**. One codebase, one SQLite file, one container — configured entirely through the admin panel, not code.

It runs restaurants, bakeries, coffee shops, food trucks, caterers, auto shops, detailers, dealerships, tire shops, home services, consultancies, cleaning and landscaping companies, and retail stores. Nineteen industry presets ship with it; a blank configuration is also available.

**Stack:** Node 22 (ESM, no build step) · Express 5 · `node:sqlite` · server-rendered HTML · plain CSS and vanilla JS · optional Stripe and Resend.

---

## Principles

- **One installation, one business.** No tenants, no shared customer database. The SQLite file *is* the business.
- **Configuration over code.** Business identity, branding, modules, catalog, bookings, pages and navigation are rows in the database.
- **Modules gate capability, never delete data.** Turning off Appointments hides booking pages and admin screens; the bookings are still there when you turn it back on.
- **Presets are seed data, not modes.** Applying "Auto repair" writes ordinary records you can then edit.
- **Boring deployment.** One process, one volume, no cron, no queue, no external services required.

---

## Quick start (development)

```sh
npm install
cp .env.example .env          # edit PUBLIC_BASE_URL and SESSION_SECRET
npm run dev                   # http://localhost:3000
```

Open `/setup`, create the owner account, then pick an industry in the setup wizard. No seed data is required.

```sh
npm test            # unit + HTTP integration tests (34 assertions, ~4 s)
npm run test:e2e    # Playwright: three industries at desktop and phone sizes
```

The e2e script needs a Chromium build. Set `CHROME_PATH` if Playwright's browser is not in the default cache.

## Docker

```sh
cp .env.example .env
# set PUBLIC_BASE_URL and SESSION_SECRET
docker compose up -d --build
```

Data lives in the `shop-data` volume at `/data` (SQLite + uploads). The health endpoint is `/health`.

---

## First run

1. `/setup` — creates the first owner account. It is only reachable while the users table is empty.
2. `/admin/setup` — pick an industry preset (or start blank), then adjust business details, brand and modules.
3. Add products/services and edit the homepage sections.
4. **Finish setup** — marks onboarding complete and removes the admin nudge.

Everything after step 1 happens in `/admin`. No source edits and no redeploy.

## Modules

| Module | What it adds | Depends on |
|---|---|---|
| Website content | Pages, ordered sections, navigation, FAQs, testimonials | — (core) |
| Product catalog | Products, categories, variants, attributes, images | — |
| Service catalog | Services, durations, fixed/from/quote pricing | — |
| Online ordering | Cart, checkout, orders, fulfilment | Product catalog |
| Card payments | Stripe Checkout or Helcim Pay (CAD/USD), signed webhooks | Online ordering |
| Discounts | Percentage/fixed codes, limits, expiry | Online ordering |
| Stock tracking | Counted stock, sold-out, low-stock alerts | Product catalog |
| Delivery | Delivery option, fees, free-over threshold, area | Online ordering |
| Appointments | Slot generation, booking management, time off | Service catalog |
| Inquiries | Contact and quote-request inbox | — |
| Customer accounts | Email-verified sign-up, sign-in, order and booking history | — |
| Reviews | Moderated reviews and ratings | — |
| Loyalty | Points earned on paid orders, redeemed at checkout | Accounts + ordering |
| Newsletter | Footer signup and subscriber list | — |

Dependencies are enforced when enabling. Disabling a module that others depend on requires an explicit cascade; no data is deleted either way.

## Industry presets

Food & beverage: restaurant, bakery, coffee shop, food truck, catering.
Automotive: auto repair, auto detailing, dealership, tire shop.
Services: home services, professional services, consulting, cleaning, landscaping.
Retail: general, specialty, clothing, electronics.
Plus **custom** (blank).

Each preset writes modules, theme, hours, labels, navigation, homepage sections, an about page, categories and a small sample catalog. Applying one to a store that already has products keeps them; only the homepage and module selection are replaced.

## Configuration

Business settings, theme, commerce rules, booking rules, email settings and catalog language live in the `settings` table as validated JSON namespaces. Currency, timezone and locale are business settings, not env vars.

Deployment concerns stay in the environment: `PUBLIC_BASE_URL`, `SESSION_SECRET`, `DATA_DIR`, `PORT`, `STRIPE_*`, `RESEND_API_KEY`. See `.env.example`.

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — hosting, TLS, Stripe, email, backups, upgrades.
- [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) — day-to-day operation, task by task.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the platform is put together and how to extend it.
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — audit, decisions, delivery status and known limitations.

## Layout

```
server.js                 boot
src/app.js                express assembly
src/core/                 db, config, modules, auth, media, mail, payments, util
src/modules/              catalog, services, bookings, orders, customers, content, …
src/presets/              19 industry configurations + the applier
src/admin/                back-office routers
src/site/                 public router
src/views/                layout, components, sections, site and admin screens
public/                   styles.css, admin.css, app.js, admin.js
tests/                    unit, integration, e2e
docs/                     operator and developer documentation
```

## License

GNU GPL v3 — see `LICENSE`.
