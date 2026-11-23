# Admin guide

Everything in this guide happens in `/admin`. No source code is edited, and no deploy is needed for business changes.

## Signing in and roles

`/admin/login`. Sessions last 12 hours. Basic auth is not supported; use the form.

| Role | Can do |
|---|---|
| Owner | Everything, including users and business settings. |
| Manager | Everything except user management. |
| Staff | Dashboard, orders, bookings, inquiries, customers (view), catalog and media. |
| Viewer | Read-only orders, bookings, customers and dashboard. |

Each admin action is written to the audit log with the user, entity and IP.

## First setup

1. `/setup` creates the owner account.
2. `/admin/setup` → choose an industry.
   A preset writes modules, navigation, homepage sections, theme, hours, labels, an about page and a small sample catalog.
   It never deletes existing products; if the store already has items, only the homepage and module selection are replaced.
3. **Business** — name, tagline, description, category, contact, address, socials, currency, time zone, locale.
4. **Appearance** — logo, six colours, two fonts, corner style, share image.
5. **Modules** — turn off anything the business does not do.
6. **Pages** — adjust the homepage sections.
7. **Finish setup**.

## Business identity and hours

**Settings → Business** holds the public identity. The address, phone, email and socials appear in the footer and on the contact page. Currency, locale and time zone drive prices, dates, booking slots and email timestamps.

**Settings → Hours** is a weekly grid. A closed day removes its slots from bookings. The hours note appears under the schedule (holiday hours, "walk-ins welcome").

## Appearance

**Appearance** edits the same tokens the site and email templates use: primary, text-on-primary, accent, background, surface, text, muted and border colours; heading/body font (system, serif, rounded, mono); corner style; logo, favicon, default hero image and social share image.

The live preview panel updates as you type. Saving publishes immediately. Six theme presets fill the palette as a starting point.

Logos are best as PNG or SVG on a transparent background. Upload via **Media**, then paste the filename or choose it in a field.

## Pages and sections

**Pages** lists every page. The homepage is marked and lives at `/`; other pages live at `/p/<slug>`.

A page is a title, slug, draft/published status, SEO title/description and an ordered list of **sections**. Section types:

- **Hero** — eyebrow, headline, copy, image, up to two buttons, left/centre, tall.
- **Image + text** — story block, image left or right.
- **Text block** — heading and prose; blank lines become paragraphs.
- **Product grid** — products, optionally one category, featured-only, 2–4 columns.
- **Menu list** — compact price list grouped by category; menus and price sheets.
- **Service grid** — services with duration and price, booking link.
- **Feature list** — numbered reasons/steps, one per line as `Title | Description`.
- **Stats** — big numbers, one per line as `Number | Caption`.
- **Gallery** — image grid; one filename per line.
- **Testimonials** — approved testimonials from the back office.
- **FAQ** — questions from the FAQ list.
- **Call to action** — one button, three tones.
- **Booking prompt** — availability call to action.
- **Contact & hours** — address, phone, email, map link and schedule.
- **Banner** — slim promotional strip with optional background image.

Add a section, edit its fields, move it up or down, remove it. Content is live on save for published pages.

**Navigation** edits header links and footer links: label, URL, order, visibility. Catalog, services, booking and contact links are added automatically when their modules are enabled, so you do not have to duplicate them.

**FAQs** and **Testimonials** are shared pools used by any page section. Testimonials can be hidden without deleting them.

## Products

**Products → New product.** Fields:

- Name, category, SKU (auto-generated if blank), URL slug.
- Short description (cards, search), long description (paragraphs).
- Regular price, optional sale price (must be lower), unit cost (margin only, never shown to customers), taxable.
- Visible, featured, sort order.
- Image and gallery.
- **Attributes** — free-form specs, one per line as `Label | Value`. Allergens, dimensions, engine size — whatever the industry needs.
- **Variants** — a variant group plus options, one per line as `Label | Value`. Every member of a group needs the same option labels. The storefront shows one card with a picker and "from" price.
- **Stock** (when Stock tracking is on) — counted stock, sold-out switch, maximum per order.

Deleting a product never rewrites history: order lines keep their own name, SKU and price. The product CSV export includes price, cost, stock and URL.

## Services and bookings

**Services** are sold over time rather than shipped:

- Duration (minutes), buffer after (cleanup/travel), capacity per slot.
- Price type: fixed, starting-from, or quote-only.
- Category, description, image, attributes, visibility.

**Bookings** shows a day sheet with previous/next day, today, and all-upcoming views. Confirm, complete or cancel; each action can email the customer. Customer notes are visible; internal notes stay in the back office.

**Time off** blocks slots for a date range. Times are entered in the business time zone. Existing bookings are not deleted by a closure — cancel them explicitly if needed.

Availability is generated from opening hours, service duration and buffer, existing bookings, capacity, minimum notice and how far ahead you accept bookings. Nothing is pre-created.

## Orders

**Orders** lists every order with status tabs and search. The detail page shows customer, fulfilment address, line items, totals, notes and payment state.

- **Status**: pending → confirmed → ready → completed; cancelled. Cancelling returns reserved stock. It does **not** refund a card payment.
- **Payment**: mark paid (for cash/e-transfer), mark refunded (record only — refund in Stripe), resend the confirmation email.
- **Internal notes** are staff-only.

Orders placed with the offline method are created unpaid with `pending`; confirmation depends on your process. Card orders are marked paid by the Stripe webhook.

## Customers, inquiries, reviews

**Customers** are created automatically by orders and bookings. The detail page shows paid spend, orders, bookings, loyalty points, notes and marketing consent. Export to CSV.

**Inquiries** is a shared inbox for the contact form and quote requests. Mark new/read/archived, add internal notes, reply by email.

**Reviews** arrive pending. Approve to publish on the product page, reject to hide, or delete. Ratings appear as stars and in product structured data.

## Discounts

**Discounts** creates codes that are percentage or fixed amount, with optional minimum subtotal, maximum uses, start and expiry. Codes are all-or-nothing at checkout: an inapplicable code returns an error instead of silently charging full price. Order rows snapshot the code and amount.

## Modules

**Modules** is the capability switchboard. Each card explains what the module adds and lists its features.

- Enabling a module whose dependency is off fails with a readable message (e.g. Appointments needs Service catalog).
- Disabling a module that others depend on requires confirming a cascade; dependants are disabled too.
- **No data is deleted.** Re-enable and everything is where you left it.

Content, media, settings and users are core and cannot be disabled.

## Users

Owner-only. Create a user with a temporary password (≥ 10 characters, letter + number), assign a role, disable instead of deleting when someone leaves. Changing a password or role signs that user out everywhere. The last owner cannot be deleted or demoted.

## Newsletter and loyalty

**Subscribers** lists footer signups with CSV export. **Loyalty** awards points on paid orders (default 1 point per dollar, 100 points = $5, capped at 50% of an order — both rates live in the loyalty module config); customers redeem at checkout and see their balance in their account.

Customer accounts are optional and require the email key: a customer registers on the site, receives a confirmation link, and only gets a working password after clicking it. That is what stops anyone from claiming an account on someone else's email. Setting a customer's password in the back office signs their sessions out everywhere.

## Data safety

- Deleting a product, service, page or section is immediate and has a confirmation prompt.
- Disabling a module never deletes data.
- Backups are your responsibility; see `docs/DEPLOYMENT.md`. The database and `uploads/` are the complete record.
