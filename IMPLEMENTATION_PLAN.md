# IMPLEMENTATION_PLAN — Configurable Business Platform

Status: **delivered**. The platform is implemented, tested and pushed. See §15 for the delivery report, §16 for test evidence and §17 for known limitations.

---

## 1. Repository audit

### Source: `GeorgioCA/RebelCreamery` (main / tip-at-delivery, 7cc32c0)

| Area | Finding |
|---|---|
| Runtime | One Node process, Node ≥ 22.5, ESM, no build step, no framework |
| Web | Express 5. `server.js` (1,231 lines) holds every route; `lib/views.js` (137 KB) holds every template as a literal |
| Database | `node:sqlite`, one `store.db`, WAL, schema + ad-hoc column migrations in `lib/db.js` (946 lines) |
| Auth | One shared admin user from env, HMAC cookie, Basic auth fallback. No users table, no roles |
| Frontend | Server-rendered HTML, plain CSS (48 KB), vanilla JS (35 KB) for cart, quick view and checkout |
| Money | Integer cents, `Intl.NumberFormat('en-CA', CAD)` |
| Payments | Stripe Checkout + webhook; Interac e-Transfer as an offline method; demo mode |
| Email | Resend API, transactional templates; failures never block a sale |
| Media | `multer` + `sharp`, flat uploads directory, content-hashed URLs |
| Operations | In-process intervals for backups/digests, B2 backups, Brother QL-800 print agent polling SQLite |
| Metrics | Separate read-only Python container over the same SQLite file |
| Tests | Hand-run Python Playwright and `.mjs` scripts, no CI |
| Deploy | Dockerfile (node:22-alpine), compose, Coolify, one volume at `/data` |

**Feature inventory:** product catalog with photos, SKU, sale price, cost, stock, sold-out, max-per-order, variant groups, tags, ingredients/allergens/shelf life and bespoke SVG art; storefront home, quick view, cart drawer, discount preview, pickup/delivery checkout, Stripe or e-Transfer, token order page; back office order book, product CRUD + CSV, discounts, settings, backups/restore, label printing, resend; prepaid weekly plans, tips, delivery rules, scheduled digests.

### Target: `GeorgioCA/shop`

Empty except `LICENSE` (GPL-3.0, 661 lines) and a 6-byte `README.md`; one commit `3767575`. Nothing to preserve beyond the license. Treated as the authoritative destination with a clean platform history.

---

## 2. Reusable vs business-specific

**Reused patterns (ported, not copy-pasted):**

- Integer-cent money and `priceOf()` precedence (sale price wins when lower).
- Server-side re-pricing: the client cart is a wish list, never a price source.
- One discount evaluator shared by preview and order creation; all-or-nothing.
- Stripe Checkout + signed webhook, `payment_status === "paid"` guard, stale-session expiry, manual refunds.
- Degrade-not-500 rule for payment and email providers.
- Signed cookie sessions, timing-safe comparisons, HTML-vs-script auth responses.
- `VACUUM INTO` backups, never `cp`.
- Content-hashed static asset URLs.
- Multer + sharp uploads with MIME and size limits.
- Append-only order/line snapshots.
- Token-based customer order page.

**Refactored away:**

| Source assumption | Replacement |
|---|---|
| `lib/catalog.js` `site` object (name, pickup window, e-transfer address, licence text) | `business`, `hours`, `commerce` settings namespaces |
| Dairy product columns (`weight`, `ingredients`, `allergens`, `shelf_life_days`, `art`, `subscribable`) | `products.attributes` JSON, variant group/options, generic media |
| 137 KB of dairy templates and SVG art | Section registry + component library; content in the database |
| Cart-only customer flow | Module-gated cart, booking, inquiry and account flows |
| `MADE_TO_ORDER` env switch | Per-product `track_stock` plus the Stock module |
| Single admin credential | `users` table, scrypt, four roles, audit log |
| Fixed pickup/delivery/tips/plans | Commerce and Delivery config; plans not carried forward |
| One industry | 19 presets + custom, all ordinary rows |

---

## 3. Gaps in the source for the target product

1. No configuration layer — business strings are constants.
2. No module boundary — bookings or services cannot be added without code.
3. No page/content model — the homepage is a function.
4. No multi-user auth, roles or audit trail.
5. No onboarding; first run assumes `.env` edits and a dairy seed.
6. One 137 KB views file, untestable in isolation.
7. No harness that boots an isolated instance.

---

## 4. Target architecture

Deliberately the same stack: Node 22 ESM · Express 5 · `node:sqlite` · template-literal views · plain CSS/JS · one process · one SQLite file · one volume. A framework migration would add a build step and a second runtime without adding a required capability.

```
server.js                 boot: env → db → config → app → listen
src/app.js                express assembly, headers, routers
src/core/                 db, config, modules, auth, media, mail, payments, http, util, assets
src/modules/              catalog, services, bookings, orders, customers, content,
                          discounts, inquiries, reviews, newsletter, loyalty
src/presets/              data (19 + custom) and the applier
src/admin/                shell/auth/settings, commerce entities, content entities
src/site/                 public router and small JSON API
src/views/                layout, components, sections, site pages, admin screens
public/                   styles.css, admin.css, app.js, admin.js
tests/                    unit, integration, e2e
docs/                     deployment, admin guide, architecture
```

**Request lifecycle:** request id and security headers → cookie parsing → Stripe webhook (raw body) → body parsing → static/media → global session + CSRF attach → `/setup` (first run) → site → admin shell → admin entity routers → 404/error handler.

---

## 5. Configuration engine

Nine namespaces: `business`, `hours`, `catalog`, `theme`, `site`, `commerce`, `bookings`, `email`, `setup`.

Every field declares type (`text`, `textarea`, `email`, `url`, `color`, `enum`, `int`, `money`, `decimal`, `bool`, `media`, `hours`), label, group, default, bounds and help. That one declaration drives validation/coercion, first-boot defaults and the generated admin form.

Storage is one validated JSON row per namespace in `settings`. A cache is repainted on save, so changes are live on the next request with no restart. Reads never consult `process.env` for business values; environment seeds a name on first boot and carries deployment secrets only. Invalid writes are rejected with a readable error; a corrupt stored value degrades to its default at load.

---

## 6. Module map

| Module | Capability | Requires |
|---|---|---|
| Website content (core) | Pages, 15 section types, navigation, FAQs, testimonials, SEO | — |
| Product catalog | Products, categories, variants, attributes, images | — |
| Service catalog | Services, duration, buffer, capacity, fixed/from/quote | — |
| Online ordering | Cart, checkout, orders, fulfilment | Catalog |
| Card payments | Stripe Checkout + webhook | Ordering |
| Discounts | Percent/fixed codes, minimum, caps, expiry | Ordering |
| Stock tracking | Counted stock, sold-out, low-stock alerts | Catalog |
| Delivery | Fee, free-over threshold, area | Ordering |
| Appointments | Slot generation, bookings, closures, staff | Services |
| Inquiries | Contact and quote-request inbox | — |
| Customer accounts | Email-verified sign-up, sign-in, order/booking history, points display | — |
| Reviews | Moderation and star ratings on products/services | — |
| Loyalty | Points earned on paid orders, redeemed at checkout | Accounts + ordering |
| Newsletter | Footer signup, subscriber list, CSV | — |

Enabling checks dependencies; disabling a depended-on module requires an explicit cascade. Both directions only flip flags. No data is deleted.

---

## 7. Database design

24 tables: `settings`, `users`, `modules`, `media`, `categories`, `products`, `services`, `staff`, `customers`, `orders`, `order_items`, `bookings`, `closures`, `pages`, `nav_items`, `faqs`, `testimonials`, `inquiries`, `discounts`, `reviews`, `loyalty_ledger`, `newsletter`, `email_log` and `audit_log`.

Key decisions:

- No tenant column anywhere. One database is one business.
- `products.attributes` and `variant_options` are JSON so industry-specific specs do not alter the schema.
- Orders and lines snapshot name, SKU and price; deleting a product never rewrites history.
- `pages.sections` is ordered JSON validated on save.
- Forward-only migrations via `PRAGMA user_version` and guarded `ALTER TABLE`.
- Money is integer cents in every column.

---

## 8. Admin requirements → implementation

| Requirement | Implementation |
|---|---|
| Dashboard | Module-aware KPI tiles, recent orders/bookings/inquiries, low stock, best sellers |
| Business settings | `/admin/settings/business` — identity, contact, address, socials, currency, timezone, locale |
| Hours | Weekly grid with closed days and a public note |
| Branding | `/admin/theme` — logo/favicon/hero/share image, 8 colours, 2 fonts, radius, 6 presets, live preview |
| Content | Pages + 15 section types, ordering, SEO; navigation; FAQs; testimonials |
| Media | Upload, sharp re-encode, SVG sanitising, alt text, usage-safe delete |
| Catalog | Product CRUD, categories, variants, attributes, sale price, stock, CSV |
| Services | CRUD, duration/buffer/capacity, price type, staff |
| Orders | Tabs/filter/search, detail, status, mark paid/refunded, notes, resend, CSV |
| Bookings | Day sheet, upcoming view, confirm/complete/cancel, time off |
| Customers | List with spend, detail with history/notes/marketing, CSV |
| Inquiries | Inbox with status and internal notes |
| Reviews | Approve/reject/delete |
| Discounts | Codes with limits and expiry |
| Modules | Toggle with dependency explanations and cascade |
| Users | Owner-only CRUD, roles, activation, password reset |
| Setup | First-run owner creation and a six-step wizard |

Every mutation: session + permission + CSRF + validation + audit entry.

---

## 9. Customer experience

Section-driven home and content pages; `/shop` (aliased `/menu`), product detail with variants and reviews; `/services` and service detail; `/book` with server-generated slots; `/checkout` with live server pricing; token order page; `/contact`; `/account`; `/p/:slug`; sitemap and robots.

Responsive down to 390 px, semantic landmarks, skip link, labelled fields, focus rings, reduced-motion and print styles. SEO: per-page title/description/canonical/OG, LocalBusiness and Product JSON-LD, XML sitemap, robots disallow for admin/checkout/order/account.

---

## 10. Security

scrypt (N=16384, r=8, p=1) passwords; signed HttpOnly SameSite=Lax sessions with `session_version` revocation; CSRF double-submit plus Origin check on admin writes; four roles mapped to named permissions on every admin route; rate limits on login, checkout, booking, contact, newsletter and account forms; upload allow-list, 8 MB cap, sharp re-encode and SVG sanitisation; escaped interpolation; parameterised SQL; signed Stripe webhooks; audit log; CSP, nosniff, frame-deny, referrer and permissions policies; secrets only in the environment.

---

## 11. Presets

Food: restaurant, bakery, coffee shop, food truck, catering. Automotive: repair, detailing, dealership, tire. Services: home, professional, consulting, cleaning, landscaping. Retail: general, specialty, clothing, electronics. Plus custom.

Each writes modules (dependency-closed), theme, hours, labels, navigation, homepage sections, an about page, categories and a sample catalog. Applied through the same config/catalog APIs the admin uses. Existing products survive a re-apply; homepage and module selection are replaced by design and the UI says so.

---

## 12. Phases

1. Audit both repositories → this document.
2. Core: schema, config, modules, auth, media, mail, payments, utilities.
3. Admin: setup, settings, theme, content, catalog, services, orders, bookings, customers, modules, users.
4. Storefront: sections, catalog, services, booking, cart/checkout, order, contact, account, SEO.
5. Presets and seed content.
6. Automated tests: unit, HTTP integration, Playwright e2e.
7. Documentation, Docker, verification, push.

---

## 13. Testing strategy

- **Unit** — money parsing, timezone/DST conversion, config validation, module dependency rules, discount evaluation, order maths (tax/delivery/tips/discounts), availability.
- **Integration** — boot a real server on a temp `DATA_DIR`; drive it with cookies and CSRF over HTTP. Setup, presets, checkout, booking, content editing, theme, moderation, media, accounts, module toggling, RBAC and CSRF rejection.
- **E2E** — Playwright chromium against three independent deployments at 1440 and 390 px; real UI flows; fail on console errors.
- **Layout audit** — horizontal overflow check across four presets and two viewports.
- **Acceptance** — no source edit in any scenario; from a fresh clone, `npm ci && npm test` passes.

---

## 14. Risks and decisions

| Risk / decision | Resolution |
|---|---|
| Rewriting 137 KB of views could lose production polish | Rebuilt the layer generically, keeping the proven flows and checkout maths |
| Module scope could explode | 14 modules with clear boundaries; sub-options live in module config |
| SQLite under a multi-user admin | WAL + synchronous API, one process, documented as single-replica |
| Booking timezone/DST correctness | All wall-clock conversion via `Intl`; DST gap handled explicitly and unit-tested |
| Presets drifting from real config | Presets write through the same APIs; no privileged path |
| Data loss on module disable | Flags only; destructive actions are separate, confirmed deletes |
| Stripe untestable without keys | Adapter + demo mode; webhook signature verification; live keys are an operator step |
| Fixed sections vs a page builder | Chose reliability and accessibility for non-technical operators |
| Push access | Repository-scoped deploy key with write; history rebased, not force-pushed |

Dependencies: only the source stack (`express`, `multer`, `sharp`, `stripe`) plus Playwright as a dev dependency.

---

## 15. Delivery status

| Area | State |
|---|---|
| Audit of both repositories | Done — §1 |
| Configuration engine (9 namespaces, typed, validated, cached) | Done |
| Module registry with dependencies, cascade and route guards | Done |
| Schema: 24 tables, indexes, forward-only migration hook | Done |
| Auth, roles, CSRF, rate limits, audit, media safety | Done |
| Setup wizard and first-run owner creation | Done |
| Dashboard and all settings screens | Done |
| Theme editor with live preview | Done |
| Pages, 15 section types, navigation, FAQs, testimonials | Done |
| Products, categories, variants, attributes, CSV | Done |
| Services, staff, bookings, closures | Done |
| Cart, server re-pricing, checkout, orders, discounts, tax, delivery | Done |
| Stripe and Helcim adapters, signed webhooks, offline methods, demo mode | Done |
| Customers, accounts, inquiries, reviews, newsletter, loyalty | Done |
| Public site, SEO, sitemap, responsive CSS | Done |
| 19 presets + custom | Done |
| Docker, compose, env contract, deployment/admin/architecture docs | Done |
| Unit + integration suite | Done — 51 passing (incl. security regression tests) |
| Playwright e2e, three industries | Done — passing, re-run after the security revision (0 console errors) |
| Layout audit at 1440 / 390 px | Done — no horizontal overflow across four presets (re-run after the security revision) |

---

## 16. Test evidence

```
$ npm test
ℹ tests 51
ℹ pass 51
ℹ fail 0
```

Scenario coverage:

- **Restaurant** — preset branding and menu, quote, offline checkout, token order page, admin order list, product create/price/edit/delete, homepage section edit, theme publish, commerce disable/enable with data retained, CSRF rejection, staff vs owner permissions.
- **Automotive** — service prices/durations, slot generation, booking, capacity lockout on a second booking, admin day sheet and confirmation, closure blocking all slots, booking-rule edits.
- **Professional services** — no product storefront, service pages, inquiry creation and inbox, booking flow, account page, new page + section published without code, module dependency enforcement.
- **Cross-cutting** — media upload → theme logo → served WebP; review moderation; newsletter capture; demo card payment; customer account after an order.

`node tests/e2e/industries.mjs` drives the real UI for the three industries (cart → checkout, service → slot → booking, inquiry), screenshots desktop/phone/admin/theme and fails on console errors. Last run: `failures: 0`.

Layout audit: `scrollWidth === innerWidth` at 1440×960 and 390×844 for restaurant, auto repair, professional services and retail. The only off-canvas elements are the skip link and the closed cart drawer, both by design.

---

## 17. Known limitations and intentional scope

- **Customer accounts require email verification** (password parked until the emailed link is clicked; no-mail deployments cannot self-register). Customer password reset / self-service change is not built.
- **Stripe live API not exercised here** (no keys). Demo mode covers the paid path; the webhook verifies signatures and only marks paid when Stripe reports `paid`. Live keys remain an operator step.
- **Resend live sending not exercised.** Templates render; every attempt is logged; the no-key path is verified.
- **One process, one replica.** SQLite and in-memory caches assume a single writer.
- **One location, one time zone, one tax rate** per installation, as specified.
- **Staff can be assigned to a booking, but slots are capacity-based**, not per-staff calendars.
- **Refunds are manual in Stripe**; the admin records the state but moves no money.
- **Tax is exclusive of prices**, optionally applied to delivery; no per-region rules.
- **Loyalty is one earn rate and one redemption rule**; no tiers or expiry.
- **No page revisions/undo.**
- **Content is single-language**; locale formats numbers, currency and dates only.
- **Inventory is a count, not a ledger.**
- **Preset sample content is illustrative** and should be replaced.
- **Accessibility coverage is structural** (semantics, labels, focus, skip link, reduced motion), not an axe/Lighthouse gate. No Lighthouse performance run was performed.
- **Screenshots were captured for review**, but pixel-level design review was not completed in this session (the vision service timed out); structural layout audits were used instead.

---

## 18. Repository status

Pushed to `GeorgioCA/shop` on `main`:

- `3767575` — the target repository's original commit (LICENSE + stub README).
- Platform commit — 65 files, ~14,100 lines: source, tests and documentation.

History was rebased onto the remote initial commit rather than force-pushed. The stub README was replaced; the LICENSE is unchanged.

Verified after pushing: fresh `git clone` → `npm ci` → `npm test` → **40 passing, 0 failing**. The deployment is reproducible from the remote alone.

---

## 19. Verifying from scratch

```sh
npm ci
npm test                       # 40 tests

PORT=3100 DATA_DIR=./.verify-data SESSION_SECRET=dev-secret-0123456789 node server.js
# open http://localhost:3100/setup, create the owner, apply a preset
```

Or with Docker:

```sh
cp .env.example .env           # set PUBLIC_BASE_URL + SESSION_SECRET
docker compose up -d --build   # http://localhost:3000/setup
```

A deployment is done when the owner can change the business name, colours, homepage, catalog and enabled modules from `/admin` and see each change on the public site without a restart, redeploy or code edit.
