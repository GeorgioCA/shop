
---

## 13. Delivery status

Implemented and exercised, in the order built:

| Area | State | Where |
|---|---|---|
| Repository audit of source and target | Done | §1 |
| Configuration engine (9 namespaces, typed schema, validation, cache) | Done | `src/core/config.js` |
| Module registry, dependency enforcement, cascade, route guards | Done | `src/core/modules.js` |
| Schema: 22 tables, indexes, forward-only migration hook | Done | `src/core/db.js` |
| Auth: scrypt, signed sessions, session versioning, 4 roles, CSRF, rate limits, audit | Done | `src/core/auth.js` |
| Onboarding: first-run owner creation, 6-step wizard, preset application | Done | `/setup`, `/admin/setup` |
| Dashboard (module-aware KPIs, recent orders/bookings/inquiries, low stock, best sellers) | Done | `src/views/admin/forms.js` |
| Business settings, hours, catalog labels, commerce, booking rules, email | Done | `/admin/settings/*` |
| Theme editor with palette presets, live preview, logo/media | Done | `/admin/theme` |
| Pages, 15 section types, ordering, SEO, navigation, FAQs, testimonials | Done | `src/views/admin/content.js` |
| Media library: upload, sharp re-encode, SVG sanitisation, alt text, usage-safe delete | Done | `src/core/media.js` |
| Product CRUD, categories, variants, attributes, sale price, CSV export | Done | `src/modules/catalog.js` |
| Service CRUD, staff, price types, durations, capacity | Done | `src/modules/services.js` |
| Ordering: cart, server re-pricing, pickup/delivery, tax, discounts, tips, stock reservation | Done | `src/modules/orders.js` |
| Orders admin: tabs, search, detail, status, paid/refunded, notes, resend, CSV | Done | `src/views/admin/orders.js` |
| Payments: Stripe Checkout adapter, signed webhook, offline methods, demo mode, stale expiry | Done | `src/core/payments.js` |
| Bookings: slot generation, DST-safe conversion, capacity, closures, day sheet, statuses | Done | `src/modules/bookings.js` |
| Customers: auto-provisioning, spend, history, notes, marketing, CSV | Done | `src/modules/customers.js` |
| Accounts: registration after first order, sign-in, history, points | Done | `/account` |
| Inquiries inbox, reviews with moderation, discounts, newsletter, loyalty | Done | `src/modules/*` |
| Public site: sections, catalog, product detail, services, booking, checkout, order, contact, account, content pages | Done | `src/site/router.js` |
| SEO: per-page meta, canonical, OG, LocalBusiness/Product JSON-LD, sitemap, robots | Done | `src/views/site.js` |
| 19 industry presets + custom | Done | `src/presets/data.js` |
| Responsive CSS, focus states, skip link, reduced-motion, print | Done | `public/*.css` |
| Docker, compose, env contract, deployment/admin/architecture docs | Done | root + `docs/` |
| Unit + integration test suite | Done — 34 passing | `tests/` |
| Playwright three-industry e2e | Done — passing | `tests/e2e/industries.mjs` |
| Layout overflow audit at 1440 / 390 px | Done — no horizontal overflow across four presets | `tests/e2e/layout-audit.mjs` |

## 14. Test evidence

```
$ npm test
ℹ tests 34
ℹ suites 0
ℹ pass 34
ℹ fail 0
```

Coverage by scenario:

- **Restaurant** — preset branding and menu, 10 products, quote, offline checkout, token order page, admin order list, product create/price/edit/delete, homepage section edit, theme publish, commerce disable/enable with data retained, CSRF rejection, staff RBAC vs owner.
- **Automotive** — services with prices/durations, slot generation, booking, capacity lockout on the second booking, admin day sheet and confirmation, closure blocking every slot, booking-rule edits.
- **Professional services** — no product storefront, service pages, inquiry creation and inbox, booking flow, account sign-in page, new page + section published without code, module dependency enforcement.
- **Cross-cutting** — media upload → theme logo → served WebP; review moderation before publication; newsletter capture; demo card payment end-to-end; customer account creation after an order.

Playwright (`node tests/e2e/industries.mjs`) drives the real UI for all three industries: adds to cart and pays (restaurant), books and confirms a slot (automotive), sends an inquiry (consulting); captures desktop, phone, cart, admin and theme screenshots; fails on any console error. The last run reported `failures: 0`.

Layout audit at 1440×960 and 390×844 for restaurant, auto repair, professional services and retail: `scrollWidth === innerWidth` on every page; the only off-canvas elements are the skip link (by design) and the closed cart drawer.

## 15. Known limitations and intentional scope

- **Stripe was not exercised against the live API** (no keys in this environment). Demo mode covers the paid-order path; the webhook handler verifies signatures and only marks `paid` when Stripe reports `paid`. Live keys and a test charge remain an operator step.
- **Resend was not exercised against the live API.** Templates render, every send attempt is logged, and the no-key path is verified. A verified domain and key are operator steps.
- **One process, one replica.** SQLite and the in-memory caches assume a single writer. Documented in deployment.
- **No multi-location model.** One business, one address, one time zone per installation — as specified. Multiple locations would be a separate installation or a future schema addition.
- **Staff are assignable to a booking but slots are capacity-based, not per-staff calendars.** Adequate for a small shop; not a workforce scheduler.
- **Refunds are manual in Stripe.** The admin records the refunded state; it never moves money.
- **Tax is a single rate**, exclusive of prices, optionally applied to delivery. No per-region or inclusive-tax rules.
- **Loyalty is one earn rate and one redemption rule**, configured in module config, with no tiers or expiry.
- **No page revisions/undo.** Section edits are immediate; the confirmation-free model matches the small-business target.
- **Content is single-language.** Locale formats numbers, currency and dates; there is no translated-content model.
- **Inventory is a count, not a ledger.** Sales decrement stock; cancelling an order restores it; there is no stock-movement history.
- **Preset sample content is illustrative.** Names, prices and copy are seeds to be replaced, not production content.
- **Automated accessibility coverage is structural** (semantics, labels, focus, skip link, reduced motion), not an axe/Lighthouse gate. No Lighthouse performance run was performed in this environment.
- **Screenshots were captured for visual review**, but pixel-level design review was not completed in this session (the vision service timed out); structural layout audits were used instead.

## 16. Repository status

The complete application, tests and documentation are committed to the local `main` branch of the target repository working copy.

**Push blocker:** the only GitHub deploy key available in this environment (`~/.ssh/github_rebel_wireless_website`) can read `GeorgioCA/shop.git` but is denied write access (`Permission to GeorgioCA/shop.git denied to deploy key`). The work is therefore committed locally and ready to push; granting that key write access, or providing a token, completes the last step. No other repository was modified.

## 17. Verifying from scratch

```sh
npm ci
npm test                       # 34 tests
PORT=3100 DATA_DIR=$(mktemp -d) SESSION_SECRET=dev-secret-0123456789 node server.js
# open http://localhost:3100/setup, create the owner, apply a preset
```

Or with Docker:

```sh
cp .env.example .env           # set PUBLIC_BASE_URL + SESSION_SECRET
docker compose up -d --build   # http://localhost:3000/setup
```

A deployment is "done" when the owner can change the business name, colours, homepage, catalog and enabled modules from `/admin` and see each change on the public site without a restart, a redeploy or a code edit.
