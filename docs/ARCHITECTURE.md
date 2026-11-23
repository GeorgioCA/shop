# Architecture

## Shape of the system

```
Browser
  │
  ├── public site   src/site/router.js     → src/views/{layout,components,sections,site}.js
  └── /admin        src/admin/{router,commerce,content}.js → src/views/admin/*.js
                         │
                         ▼
                  src/modules/*.js          domain logic (catalog, orders, bookings, …)
                         │
                         ▼
                  src/core/*.js             db, config, modules, auth, media, mail, payments
                         │
                         ▼
                  data/store.db + data/uploads
```

One Node process. No build step: the browser loads the same files the server writes. `src/app.js` builds the Express app and is exported so tests can boot it; `server.js` only handles environment, migrations, config load and listening.

## Configuration engine

**`src/core/config.js`** owns a declarative schema for nine namespaces: `business`, `hours`, `catalog`, `theme`, `site`, `commerce`, `bookings`, `email`, `setup`.

Each field declares a type (`text`, `textarea`, `email`, `url`, `color`, `enum`, `int`, `money`, `decimal`, `bool`, `media`, `hours`), label, group, default, bounds and help text. The same definition drives:

- validation and coercion on save (`coerceFields`);
- defaults on first boot (`defaultsFor`);
- the admin form renderer (`configField`).

Storage is one JSON row per namespace in `settings`. `loadConfig()` builds a cache at boot and after every save, so a settings change is visible on the next request without a restart. Reads always go through `config()`, never `process.env`, for business values. Environment variables only seed a name on first boot and carry deployment secrets.

Unknown keys are ignored; invalid values throw a readable error and the write is rejected. A hand-edited row that no longer validates falls back to the field default at load rather than breaking a page.

## Module registry

**`src/core/modules.js`** declares 14 modules with `key, name, description, category, core, requires, defaultEnabled, features`.

- `modules` table rows hold `enabled` and per-module JSON `config`.
- `isEnabled(key)` is consulted by route guards, navigation and admin screens on every request, so toggling needs no restart.
- `setModuleEnabled` refuses to enable a module with disabled dependencies, and refuses to disable one with enabled dependants unless `cascade` is passed. Cascades only flip flags; no deletes.
- `requireModule(key)` middleware 404s public routes and renders a "disabled" notice in admin.
- Navigation is built from enabled modules plus `nav_items`, so a business never sees a dead link.

Core capabilities (`content`, media, settings, users) are not toggles.

## Data model

| Table | Purpose |
|---|---|
| `settings` | Validated configuration namespaces |
| `users` | Admin accounts: scrypt hash, role, active, session version |
| `modules` | Enabled flag and per-module config |
| `media` | Uploaded images and alt text |
| `categories` | Product and service categories (`kind`) |
| `products` | Price, sale price, cost, stock, image/gallery, attributes JSON, variant group/options JSON |
| `services` | Duration, buffer, capacity, price type, attributes |
| `staff` | Optional bookable people |
| `customers` | One row per email, optional account password, marketing flag, points |
| `orders` / `order_items` | Append-only order history with line snapshots |
| `bookings` | Appointment instances with token, status, price snapshot |
| `closures` | Time off that blocks slots |
| `pages` | Slug, status, SEO and ordered `sections` JSON |
| `nav_items` | Header/footer links |
| `faqs`, `testimonials` | Shared editorial pools |
| `inquiries` | Contact/quote inbox |
| `discounts` | Codes, limits, usage |
| `reviews` | Pending/approved/rejected reviews |
| `loyalty_ledger` | Signed point entries per customer |
| `newsletter` | Subscribers |
| `email_log` | Every send attempt and its result |
| `audit_log` | Admin actions with user, entity and IP |

There is no `tenant_id`. One database is one business.

Migrations are forward-only: `PRAGMA user_version` plus guarded `ALTER TABLE` blocks in `src/core/db.js`. New installs get the full schema; existing installs run the blocks they are missing.

## Money

All amounts are integer cents. `parseCents` accepts `12.50`, `$1,234.56` and `12,50`. Formatting happens only at the edge with `money(cents, currency, locale)` from business settings.

`quote()` in `src/modules/orders.js` is the single pricing authority:

1. Resolve each cart line from the database, reject inactive/sold-out/over-max items.
2. Subtotal from server-side prices (sale price wins when lower).
3. Discount via `evaluateDiscount` — all-or-nothing.
4. Loyalty redemption, capped by available points and a percentage of the order.
5. Delivery fee unless the free-over threshold is met and the delivery module is on.
6. Tax on `subtotal − discount − points + delivery (if taxed)`.
7. Tip within bounds.

The client never sends prices. `/api/quote` and order creation call the same function, so the summary and the charge cannot disagree.

## Bookings

`availability(service, date)` in `src/modules/bookings.js`:

- reads the weekday's opening hours in the business time zone;
- converts each wall-clock slot to UTC via `zonedToUtc`, which handles DST (non-existent times move forward);
- counts overlapping bookings against service capacity;
- honours closure rows;
- drops slots inside the minimum-notice window or beyond the booking horizon;
- reserves duration + buffer, so back-to-back appointments keep their cleanup time.

Slots are never stored. `createBooking` recomputes availability and requires the requested instant to still be offered, which closes the race between page load and submit. Confirmation is automatic or manual per settings.

## Content and sections

`src/content/sections.js` declares 15 section types with typed fields and defaults. `normalizeSection` coerces and bounds every value; `normalizeSections` runs on page load and save, so a malformed row cannot break rendering.

The admin editor and the renderer both read this registry. Adding a field means adding it in one place; adding a section type means a definition plus a renderer function.

Pages store sections as ordered JSON (`[{ type, id, ...fields }]`). Reordering is a swap in that array. There is deliberately no free-form page builder: a fixed, reliable set of blocks is easier to operate and to keep accessible.

## Authentication and authorization

- Passwords: `scrypt` (N=16384, r=8, p=1, 64-byte key, random salt), constant-time comparison.
- Sessions: HMAC-signed cookie carrying user id, expiry and `session_version`. Bumping the version (password change, role change, deactivation) revokes every existing cookie. Customer sessions carry the same version guard.
- Customer accounts: registration parks the password and emails a single-use confirmation link; the password only activates when the link is clicked. Accounts therefore cannot be claimed on an email the claimant does not own.
- CSRF: random `shop_csrf` cookie (readable by JS) mirrored in a hidden `_csrf` field or `X-CSRF-Token` header, plus an Origin check for admin writes. Multipart uploads verify the token after multer parses the body.
- RBAC: four roles mapped to named permissions; every admin route declares `requirePermission(...)`.
- Capability URLs: `/order/:token` and `/booking/:token` look up by token only (CSPRNG-generated). Short, date-stamped order/booking numbers are never usable as public URLs.
- Links: every value that lands in an `href` is validated (`urlOk`) — no `javascript:`, `data:` or protocol-relative redirects; login `next` values go through `safeNext`.
- Rate limits: login (per IP *and* per account), checkout, pricing, discount checks, booking, contact, newsletter and account forms use in-process buckets keyed by IP and path.
- Uploads: MIME allow-list, 8 MB cap, sharp re-encode for rasters (strips payloads/EXIF), SVG sanitisation (no script, SMIL animation, event handlers; fragment-only hrefs), random filenames, `nosniff` and immutable caching on `/media`, and a sandboxing CSP on media responses.
- Output: every database or user value is escaped at the point of interpolation; the few trusted fragments are constructed by our own components.
- Headers: CSP (self only, per-request script nonces), HSTS when the request is secure, frame-deny, referrer policy, permissions policy.

The admin fails closed if Stripe/Helcim/Resend are missing — those degrade in capability, not into errors. The store works with no Stripe or Helcim key (offline methods) and no email key (logged, skipped), except that customer account registration needs the email key because sign-up is confirmed by a emailed link.

### Payment processors

Two card processors share one adapter layer in `core/payments.js`; the checkout simply lists the methods that are available:

- **Stripe** — redirect to Stripe Checkout; the signed webhook (`/api/stripe/webhook`) marks orders paid. Stripe handles any supported currency.
- **Helcim** (CAD/USD only) — the server creates a HelcimPay.js checkout session; the modal renders in an iframe from `secure.helcim.app` (allowed in the CSP on `/checkout` only). The browser relays the payment result to `/api/helcim/confirm`, but the relay is never trusted: the transaction is read back from the Helcim API and must match the order's total, currency and invoice number. A signed webhook (`/api/card-webhook` — the URL may not contain "Helcim", Helcim's rule) covers closed-tab cases and verifies with HMAC-SHA256 over `webhook-id.webhook-timestamp.body`, keyed by the base64-decoded verifier token.

Both paths converge on `markPaid`, which is idempotent and stores the processor reference on the order row.

## Presets

`src/presets/data.js` holds 19 configurations plus `custom`, composed from shared theme/hours helpers. `applyPreset` writes through the same APIs the admin uses:

1. business, theme, hours, site, catalog, commerce and booking settings;
2. module selection, closing the dependency graph;
3. navigation rows;
4. homepage sections and extra pages;
5. categories, sample products/services, FAQs and testimonials — only into an empty store unless explicitly asked.

There is no "industry mode" in the runtime. After applying, the preset leaves no trace except ordinary records and the `setup.preset` label.

## Request lifecycle

1. `requestId`, security headers, cookie parsing.
2. Stripe and Helcim webhooks (raw body) before JSON parsing.
3. Body parsing, static files, `/media`.
4. Global `attachUser`: verifies the admin session, loads the customer session, issues the CSRF cookie.
5. `/setup` (first run only), public site, then `/admin` routers in the order shell → commerce → content.
6. 404 and a JSON/HTML error handler with the request id.

## Testing

- `tests/unit/platform.test.js` — money parsing, DST conversion, config validation, module dependency rules, discount evaluation, order maths, availability.
- `tests/integration/*.test.js` — boot a real server on a temp `DATA_DIR`, drive it over HTTP with cookies and CSRF: setup → preset → sell → book → edit → moderate → toggle modules → RBAC. Three industries plus media, reviews, newsletter, demo payments and accounts.
- `tests/e2e/industries.mjs` — Playwright chromium, three deployments, desktop and phone screenshots, real cart/checkout, booking and contact flows; fails on console errors.
- `tests/e2e/layout-audit.mjs` — checks for horizontal overflow at 1440 and 390 px across four presets.

`npm test` runs the first two groups. The e2e script needs a Chromium binary (`CHROME_PATH`).

## Extending

**A new setting.** Add a field to the namespace in `SCHEMA` (`src/core/config.js`). It appears in the admin form, is validated, and is readable via `config().namespace.key`. Use it in the view/route.

**A new section type.** Add an entry to `SECTION_TYPES` and a function to `RENDERERS` in `src/views/sections.js`. The editor is generated.

**A new module.** Add a registry entry, create the domain file and routes, guard the routes with `requireModule(key)` and permissions, and add nav entries. Data goes in a new table through a guarded migration.

**A new preset.** Add an object to `PRESETS` using the `base()` helper and list its key in `PRESET_GROUPS`. Counts and the setup UI pick it up automatically.

**A new payment method.** Implement it in `src/core/payments.js`, add the option to `renderCheckout`, and branch in `POST /api/checkout`. Keep `quote()` as the single pricing authority.

## Decisions and trade-offs

- **SQLite, not Postgres.** A single business at modest order volume fits comfortably; it removes a service to deploy and back up. It also means one replica — documented and accepted.
- **Server-rendered strings, no framework.** Zero build step, tiny surface, fast cold start. The cost is discipline in escaping and view composition, enforced by a small component layer.
- **Modules as flags, not plugins.** Modules are compiled in and toggled per installation. That keeps one deployable artifact and makes upgrades uniform, at the cost of shipping unused code.
- **Fixed section types, not a page builder.** Reliable editing and predictable layout beat arbitrary composition for a non-technical operator.
- **Presets write data.** Re-applying a preset rewrites the homepage and module selection by design. Existing products are preserved; the admin is warned in the setup screen.
- **Offline payments first.** A new installation can take orders before it has a Stripe account, which matters for the smallest businesses this targets.
