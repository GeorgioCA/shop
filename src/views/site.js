// Customer-facing pages. Every page reads the same configuration, so a change
// in the back office is visible here on the next request.

import { db } from "../core/db.js";
import { config, businessAddressLines, socialLinks } from "../core/config.js";
import { isEnabled } from "../core/modules.js";
import { esc, money, fmtDate, fmtTime, truncate, addDays, localDateStr, dayOfWeek, localParts } from "../core/util.js";
import { mediaUrl } from "../core/media.js";
import {
  icon, button, field, priceBlock, priceOf, emptyState, ratingStars, statusBadge, img
} from "./components.js";
import { renderSections, paragraphs, productCard, serviceCard } from "./sections.js";
import { csrfField } from "./layout.js";
import { availability, availabilityWindow } from "../modules/bookings.js";
import { loyaltySettings } from "../modules/loyalty.js";

const moneyFmt = (cents) => money(cents, config().business.currency, config().business.locale);
const b = () => config().business;

/* ------------------------------ shared blocks ----------------------------- */

export function pageHeader({ eyebrow = "", title, text = "", crumbs = [] }) {
  return `<header class="page-header">
    <div class="wrap">
      ${crumbs.length ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => `${i ? "<span>/</span>" : ""}${c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`}`).join("")}</nav>` : ""}
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
      ${title ? `<h1>${esc(title)}</h1>` : ""}
      ${text ? `<p class="lede">${esc(text)}</p>` : ""}
    </div>
  </header>`;
}

export function localBusinessJsonLd() {
  const cfg = config();
  const address = businessAddressLines();
  const dayMap = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: cfg.business.name,
    description: cfg.business.description,
    url: process.env.PUBLIC_BASE_URL || undefined,
    telephone: cfg.business.phone || undefined,
    email: cfg.business.email || undefined,
    image: cfg.theme.ogImage ? mediaUrl(cfg.theme.ogImage) : undefined,
    address: address.length ? { "@type": "PostalAddress", streetAddress: [cfg.business.address1, cfg.business.address2].filter(Boolean).join(", "), addressLocality: cfg.business.city, addressRegion: cfg.business.region, postalCode: cfg.business.postal, addressCountry: cfg.business.country } : undefined,
    openingHoursSpecification: Object.entries(cfg.hours.hours)
      .filter(([, h]) => !h.closed)
      .map(([k, h]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: dayMap[k], opens: h.open, closes: h.close })),
    sameAs: socialLinks().map(([, url]) => url)
  };
}

/* --------------------------------- home ----------------------------------- */

export function renderHome(page) {
  const sections = page?.sections?.length ? page.sections : [];
  return sections.length
    ? renderSections(sections)
    : `<section class="section"><div class="wrap">${emptyState("Your site is ready to build", "Add sections to the homepage in Pages.", button({ label: "Open the admin", href: "/admin/pages", variant: "primary" }))}</div></section>`;
}

export function renderContentPage(page) {
  return `${pageHeader({ title: page.title, crumbs: [{ label: b().name, href: "/" }, { label: page.title }] })}${renderSections(page.sections)}`;
}

/* -------------------------------- catalog -------------------------------- */

export function renderCatalog({ products, categories, activeCategory = "", query = "", total = 0 }) {
  const cfg = config();
  const cats = categories.filter((c) => c.active);
  return `${pageHeader({
    eyebrow: cfg.business.category,
    title: cfg.catalog.productsLabel,
    text: total ? `${total} ${total === 1 ? cfg.catalog.productSingular.toLowerCase() : cfg.catalog.productsLabel.toLowerCase()}` : "",
    crumbs: [{ label: b().name, href: "/" }, { label: cfg.catalog.productsLabel }]
  })}
  <section class="section section-tight"><div class="wrap">
    <form class="filters" method="get" action="/shop" role="search">
      <div class="chips">
        <a class="chip ${!activeCategory ? "is-active" : ""}" href="/shop">All</a>
        ${cats.map((c) => `<a class="chip ${activeCategory === c.slug ? "is-active" : ""}" href="/shop?category=${esc(c.slug)}">${esc(c.name)}</a>`).join("")}
      </div>
      <label class="search"><span class="sr-only">Search</span>${icon("help", { size: 16 })}<input class="input input-sm" type="search" name="q" value="${esc(query)}" placeholder="Search"></label>
    </form>
    ${products.length
      ? `<div class="grid grid-3">${products.map(productCard).join("")}</div>`
      : emptyState("Nothing here yet", query ? "Try a different search." : "Check back soon.", isEnabled("inquiries") ? button({ label: "Ask us", href: "/contact", variant: "secondary" }) : "")}
  </div></section>`;
}

export function renderProduct({ product, members, reviews, reviewAvg, csrf, related = [], nonce = "" }) {
  const cfg = config();
  const images = [product.image, ...(product.gallery || [])].filter(Boolean);
  const soldOut = product.sold_out || (product.track_stock && product.stock <= 0);
  const variants = members.length > 1;
  const attrs = Object.entries(product.attributes || {});
  const commerce = isEnabled("commerce") && !soldOut;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: truncate(product.short_desc || product.description, 300),
    sku: product.sku || undefined,
    image: images.length ? images.map((i) => mediaUrl(i)) : undefined,
    offers: { "@type": "Offer", price: (product.price_now / 100).toFixed(2), priceCurrency: cfg.business.currency, availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" }
  };

  return `${pageHeader({ title: "", crumbs: [
    { label: cfg.business.name, href: "/" },
    { label: cfg.catalog.productsLabel, href: "/shop" },
    { label: product.name }
  ] })}
  <section class="section section-tight"><div class="wrap product-detail">
    <div class="product-gallery">
      ${images.length ? `<div class="product-main-img"><img src="${esc(mediaUrl(images[0]))}" alt="${esc(product.name)}"></div>
        ${images.length > 1 ? `<div class="product-thumbs">${images.slice(1, 4).map((i) => `<img src="${esc(mediaUrl(i))}" alt="">`).join("")}</div>` : ""}`
        : `<div class="product-main-img product-art"><span>${esc((product.name || "P").slice(0, 1))}</span></div>`}
    </div>
    <div class="product-info">
      <h1>${esc(product.name)}</h1>
      ${reviewAvg.count ? `<p class="product-rating">${ratingStars(reviewAvg.average)} <span>${reviewAvg.average} · ${reviewAvg.count} review${reviewAvg.count === 1 ? "" : "s"}</span></p>` : ""}
      ${product.short_desc ? `<p class="lede">${esc(product.short_desc)}</p>` : ""}
      ${cfg.catalog.showPrices ? priceBlock(product.price_cents, product.sale_price_cents, { large: true }) : ""}
      ${soldOut ? `<p class="sold-out">${badgeSoldOut()}</p>` : product.track_stock && product.stock > 0 && isEnabled("inventory") ? `<p class="stock-note">${esc(product.stock)} in stock</p>` : ""}

      ${commerce ? `<form class="buy-form" data-buy-form>
        ${variants ? `<label class="field-label" for="variant">Options</label>
          <select class="input" id="variant" data-variant-select>
            ${members.map((m) => `<option value="${esc(m.id)}" data-price="${m.price_now}" ${m.id === product.id ? "selected" : ""}>${esc(Object.values(m.variant_options || {}).join(" / ") || m.name)} — ${esc(moneyFmt(m.price_now))}</option>`).join("")}
          </select>` : ""}
        <div class="buy-row">
          <label class="qty"><span class="sr-only">Quantity</span>
            <button type="button" data-qty-down aria-label="Decrease">${icon("minus", { size: 16 })}</button>
            <input class="input" type="number" name="qty" value="1" min="1" max="${esc(product.max_per_order)}" inputmode="numeric">
            <button type="button" data-qty-up aria-label="Increase">${icon("plus", { size: 16 })}</button>
          </label>
          <button class="btn btn-primary btn-lg" type="button"
            data-add-to-cart data-id="${esc(product.id)}" data-name="${esc(product.name)}" data-price="${product.price_now}" data-qty-input="1"
            data-image="${esc(images[0] || "")}" data-variant-select="${variants ? "variant" : ""}">
            Add to cart
          </button>
        </div>
      </form>` : `<p>${button({ label: isEnabled("inquiries") ? "Ask about this" : "Contact us", href: "/contact", variant: "primary" })}</p>`}

      ${attrs.length ? `<dl class="specs">${attrs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${product.description ? `<div class="prose product-desc">${paragraphs(product.description)}</div>` : ""}
    </div>
  </div></section>

  ${isEnabled("reviews") ? `<section class="section section-tint" id="reviews"><div class="wrap narrow">
    <h2>Reviews</h2>
    ${reviews.length ? `<div class="review-list">${reviews.map((r) => `<article class="review">
      ${ratingStars(r.rating)}<h3>${esc(r.title || "Review")}</h3><p>${esc(r.body)}</p><footer>${esc(r.customer_name)}</footer>
    </article>`).join("")}</div>` : `<p class="muted">No reviews yet. If you have bought this, tell us what you thought.</p>`}
    <form method="post" action="/product/${esc(product.slug)}/review" class="form-card">
      ${csrfField(csrf)}
      <h3>Write a review</h3>
      <div class="form-row">
        ${field({ name: "customer_name", label: "Your name", required: true, value: "" })}
        ${field({ name: "rating", label: "Rating", type: "select", value: "5", options: [5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n} star${n === 1 ? "" : "s"}` })) })}
      </div>
      ${field({ name: "title", label: "Headline", value: "" })}
      ${field({ name: "body", label: "Review", type: "textarea", required: true, value: "", rows: 4 })}
      ${field({ name: "email", label: "Email (not published)", type: "email", value: "", help: "Only used to verify the review." })}
      <button class="btn btn-primary" type="submit">Submit review</button>
    </form>
  </div></section>` : ""}

  ${related.length ? `<section class="section"><div class="wrap"><h2>You might also like</h2><div class="grid grid-3">${related.map(productCard).join("")}</div></div></section>` : ""}
  <script type="application/ld+json"${nonce ? ` nonce="${esc(nonce)}"` : ""}>${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
}

const badgeSoldOut = () => `<span class="badge badge-danger">Sold out</span>`;

/* -------------------------------- services -------------------------------- */

export function renderServices({ services, categories, activeCategory = "" }) {
  return `${pageHeader({
    title: config().catalog.servicesLabel,
    crumbs: [{ label: b().name, href: "/" }, { label: config().catalog.servicesLabel }]
  })}
  <section class="section section-tight"><div class="wrap">
    ${categories.length ? `<div class="chips">${`<a class="chip ${!activeCategory ? "is-active" : ""}" href="/services">All</a>` + categories.filter((c) => c.active).map((c) => `<a class="chip ${activeCategory === c.slug ? "is-active" : ""}" href="/services?category=${esc(c.slug)}">${esc(c.name)}</a>`).join("")}</div>` : ""}
    ${services.length
      ? `<div class="grid grid-3">${services.map(serviceCard).join("")}</div>`
      : emptyState("No services listed yet", "Check back soon.")}
  </div></section>`;
}

export function renderService({ service, related = [] }) {
  const cfg = config();
  const price = service.price_type === "quote" ? "Quoted after a conversation" : service.price_type === "from" ? `From ${moneyFmt(service.price_cents)}` : moneyFmt(service.price_cents);
  return `${pageHeader({ title: service.name, crumbs: [
    { label: cfg.business.name, href: "/" },
    { label: cfg.catalog.servicesLabel, href: "/services" },
    { label: service.name }
  ] })}
  <section class="section"><div class="wrap split">
    <div class="split-copy">
      <h1>${esc(service.name)}</h1>
      ${service.short_desc ? `<p class="lede">${esc(service.short_desc)}</p>` : ""}
      <p class="service-meta">${icon("clock", { size: 18 })} ${esc(service.duration_min)} minutes ${cfg.catalog.showPrices ? `<span class="dot">·</span> ${esc(price)}` : ""}</p>
      <div class="prose">${paragraphs(service.description || service.short_desc)}</div>
      ${Object.keys(service.attributes || {}).length ? `<dl class="specs">${Object.entries(service.attributes).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      <p style="margin-top:1.5rem">${button({ label: isEnabled("bookings") ? "Book this service" : "Ask about this", href: isEnabled("bookings") ? `/book?service=${esc(service.id)}` : "/contact", variant: "primary" })}</p>
    </div>
    <div class="split-media">
      ${service.image ? `<img src="${esc(mediaUrl(service.image))}" alt="" loading="lazy">` : `<div class="media-placeholder">${icon("calendar", { size: 40 })}</div>`}
    </div>
  </div></section>
  ${related.length ? `<section class="section section-tint"><div class="wrap"><h2>Other services</h2><div class="grid grid-3">${related.map(serviceCard).join("")}</div></div></section>` : ""}`;
}

/* -------------------------------- booking --------------------------------- */

export function renderBooking({ services, service = null, date = "", days = [], day = null, csrf, error = "", prefill = {} }) {
  const cfg = config();
  if (!service) {
    return `${pageHeader({ title: "Book an appointment", text: "Choose a service to see available times.", crumbs: [{ label: cfg.business.name, href: "/" }, { label: "Book" }] })}
    <section class="section"><div class="wrap">
      <div class="grid grid-3">${services.map(serviceCard).join("")}</div>
    </div></section>`;
  }
  const timezone = cfg.business.timezone;
  const slots = day?.slots || [];
  // Group by the business's local hour, not the UTC hour in the ISO string.
  const hourOf = (s) => localParts(new Date(s.start), timezone).hour;
  const morning = slots.filter((s) => hourOf(s) < 12);
  const afternoon = slots.filter((s) => hourOf(s) >= 12 && hourOf(s) < 17);
  const evening = slots.filter((s) => hourOf(s) >= 17);

  return `${pageHeader({ title: `Book ${service.name}`, text: `${service.duration_min} minutes · choose a time below.`, crumbs: [
    { label: cfg.business.name, href: "/" }, { label: cfg.catalog.servicesLabel, href: "/services" }, { label: "Book" }
  ] })}
  <section class="section section-tight"><div class="wrap booking-layout">
    <div class="booking-main">
      ${error ? `<div class="flash flash-error" role="alert">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
      <form method="get" action="/book" class="date-picker">
        <input type="hidden" name="service" value="${esc(service.id)}">
        <label for="date">Date</label>
        <input class="input" id="date" type="date" name="date" value="${esc(date)}" min="${esc(localDateStr(new Date(), timezone))}">
        <button class="btn btn-secondary btn-sm" type="submit">Show times</button>
      </form>
      <div class="day-strip" role="list">
        ${days.map((d) => `<a role="listitem" class="day-chip ${d.date === date ? "is-active" : ""} ${d.slots.some((s) => s.available) ? "" : "is-off"}" href="/book?service=${esc(service.id)}&date=${esc(d.date)}">
          <span>${esc(fmtDate(`${d.date}T12:00:00Z`, timezone, { weekday: "short", timeZone: "UTC" }))}</span>
          <strong>${esc(d.date.slice(8))}</strong>
        </a>`).join("")}
      </div>

      ${day?.closed ? `<div class="notice">${esc(day.reason === "closed" ? "We are closed that day." : "That date is not available.")}</div>`
        : slots.length === 0 ? `<div class="notice">${esc(cfg.bookings.closedMessage)}</div>`
        : `<form method="post" action="/book" class="form-card booking-form">
          ${csrfField(csrf)}
          <input type="hidden" name="service_id" value="${esc(service.id)}">
          <input type="hidden" name="date" value="${esc(date)}">
          ${[["Morning", morning], ["Afternoon", afternoon], ["Evening", evening]].map(([label, group]) =>
            group.length ? `<fieldset class="slot-group"><legend>${label}</legend><div class="slots">
              ${group.map((s) => `<label class="slot ${s.available ? "" : "is-disabled"}">
                <input type="radio" name="starts_at" value="${esc(s.start)}" ${s.available ? "" : "disabled"} required>
                <span>${esc(s.label)}</span>${s.available && s.remaining < 3 ? `<small>${s.remaining} left</small>` : ""}
              </label>`).join("")}
            </div></fieldset>` : ""
          ).join("")}
          <h3>Your details</h3>
          <div class="form-row">
            ${field({ name: "name", label: "Name", required: true, value: prefill.name || "", autocomplete: "name" })}
            ${field({ name: "phone", label: "Phone", required: !!cfg.bookings.requirePhone, value: prefill.phone || "", type: "tel", autocomplete: "tel" })}
          </div>
          ${field({ name: "email", label: "Email", required: true, value: prefill.email || "", type: "email", autocomplete: "email" })}
          ${field({ name: "notes", label: "Anything we should know?", type: "textarea", value: "", rows: 3 })}
          <p class="form-note">Times are shown in ${esc(timezone.replace("_", " "))}. ${cfg.bookings.confirmationMode === "manual" ? "We will confirm by email." : "You will get a confirmation by email."}</p>
          <button class="btn btn-primary btn-lg" type="submit">Request this time</button>
        </form>`}
    </div>
    <aside class="booking-side">
      <div class="side-card">
        <h3>${esc(service.name)}</h3>
        <p class="muted">${esc(service.duration_min)} minutes</p>
        ${cfg.catalog.showPrices ? `<p class="side-price">${esc(service.price_type === "quote" ? "Quoted" : moneyFmt(service.price_cents))}</p>` : ""}
        <p class="fine">${esc(cfg.bookings.leadHours ? `Book at least ${cfg.bookings.leadHours} hours ahead.` : "")}</p>
        <p class="fine">${esc(cfg.bookings.maxAdvanceDays)} days ahead.</p>
      </div>
    </aside>
  </div></section>`;
}

/* -------------------------------- checkout -------------------------------- */

export function renderCheckout({ csrf, customer = null, points = null }) {
  const cfg = config();
  const c = cfg.commerce;
  const methods = [];
  if (c.onlinePayments && isEnabled("payments")) methods.push({ value: "stripe", label: "Pay by card", help: "Secure checkout. You will be redirected." });
  if (c.offlinePayments) methods.push({ value: "offline", label: c.offlineLabel || "Pay in person", help: c.offlineInstructions });

  return `${pageHeader({ title: "Checkout", crumbs: [{ label: cfg.business.name, href: "/" }, { label: "Checkout" }] })}
  <section class="section section-tight"><div class="wrap checkout-layout">
    <div class="checkout-main">
      <div class="notice" data-cart-empty hidden>Your cart is empty. <a href="/shop">Browse the shop</a>.</div>
      <form class="form-card checkout-form" data-checkout-form novalidate>
        ${csrfField(csrf)}
        <input type="hidden" name="items" data-cart-field>
        <h2>Contact</h2>
        <div class="form-row">
          ${field({ name: "name", label: "Name", required: true, value: customer?.name || "", autocomplete: "name" })}
          ${field({ name: "email", label: "Email", required: true, value: customer?.email || "", type: "email", autocomplete: "email" })}
        </div>
        ${field({ name: "phone", label: "Phone", required: !!c.requirePhone, value: customer?.phone || "", type: "tel", autocomplete: "tel", help: c.requirePhone ? "For delivery updates." : "Optional, but useful if we need to reach you." })}

        <h2>Fulfilment</h2>
        <div class="radio-row">
          <label class="radio-pill"><input type="radio" name="fulfilment" value="pickup" checked><span>${icon("pin", { size: 18 })} Pickup</span></label>
          ${isEnabled("delivery") && c.deliveryEnabled ? `<label class="radio-pill"><input type="radio" name="fulfilment" value="delivery"><span>${icon("box", { size: 18 })} Delivery</span></label>` : ""}
        </div>
        <div data-delivery-fields hidden>
          ${field({ name: "address", label: "Delivery address", value: "", autocomplete: "street-address" })}
          ${isEnabled("delivery") && c.deliveryArea ? `<p class="help">We deliver to ${esc(c.deliveryArea)}. ${c.deliveryFeeCents ? `${moneyFmt(c.deliveryFeeCents)} delivery` : "Free delivery"}${c.deliveryFreeOverCents ? `, free over ${moneyFmt(c.deliveryFreeOverCents)}.` : "."}</p>` : ""}
        </div>
        ${c.pickupEnabled ? `<p class="help" data-pickup-note>${esc(c.pickupInstructions)}</p>` : ""}
        ${c.allowOrderNotes ? field({ name: "notes", label: "Order notes", type: "textarea", value: "", rows: 2, placeholder: "Allergies, a gate code, anything useful" }) : ""}

        <h2>Payment</h2>
        ${methods.length > 1 ? `<div class="radio-row">${methods.map((m, i) => `<label class="radio-pill"><input type="radio" name="payment_method" value="${esc(m.value)}" ${i === 0 ? "checked" : ""}><span>${esc(m.label)}</span></label>`).join("")}</div>
          <p class="help">${esc(methods[0].help || "")}</p>`
          : methods.length === 1 ? `<input type="hidden" name="payment_method" value="${esc(methods[0].value)}"><p class="payment-single">${icon("lock", { size: 16 })} ${esc(methods[0].label)} — ${esc(methods[0].help || "")}</p>`
          : `<div class="notice">Online ordering is not accepting payments right now. Please contact us to order.</div>`}

        ${isEnabled("promotions") ? `<details class="discount-box"><summary>Have a discount code?</summary>
          <div class="inline-form">${field({ name: "code", label: "Code", value: "" })}<button class="btn btn-secondary" type="button" data-apply-code>Apply</button></div>
          <p class="help" data-code-msg aria-live="polite"></p>
        </details>` : ""}

        ${points && points.available >= 100 ? (() => {
          const per100 = Math.max(1, Math.round(loyaltySettings().redeemCentsPer100 || 500));
          return `<label class="check"><input type="checkbox" name="use_points" value="1"><span>Use my ${esc(points.available)} loyalty points (up to ${esc(moneyFmt(Math.floor(points.available / 100) * per100))} off)</span></label>`;
        })() : ""}

        <div class="checkout-submit">
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-checkout-submit>Place order</button>
          <p class="fine">By placing this order you agree to our policies. ${c.taxRatePct ? `${esc(c.taxLabel)} is calculated at checkout.` : ""}</p>
        </div>
        <div class="flash flash-error" data-checkout-error hidden role="alert"></div>
      </form>
    </div>
    <aside class="checkout-side">
      <div class="side-card">
        <h2>Order summary</h2>
        <div data-cart-summary><p class="muted">Loading…</p></div>
        <div class="totals" data-cart-totals></div>
      </div>
      <div class="side-card side-help">
        <p>${icon("phone", { size: 16 })} <a href="tel:${esc((cfg.business.phone || "").replace(/[^\d+]/g, ""))}">${esc(cfg.business.phone || "Call us")}</a></p>
        <p>${icon("mail", { size: 16 })} <a href="mailto:${esc(cfg.business.email)}">${esc(cfg.business.email)}</a></p>
      </div>
    </aside>
  </div></section>`;
}

/* --------------------------------- order ---------------------------------- */

export function renderOrder({ order, items, justPaid = false }) {
  const cfg = config();
  const tz = cfg.business.timezone;
  const steps = [
    ["pending", "Received"],
    ["confirmed", "Confirmed"],
    ["ready", "Ready"],
    ["completed", "Completed"]
  ];
  const idx = Math.max(0, steps.findIndex(([k]) => k === order.status));
  const cancelled = order.status === "cancelled";
  return `${pageHeader({ title: `Order ${order.number}`, crumbs: [{ label: cfg.business.name, href: "/" }, { label: `Order ${order.number}` }] })}
  <section class="section section-tight"><div class="wrap narrow">
    ${justPaid ? `<div class="flash flash-ok">${icon("check", { size: 18 })}<span>Payment received. Thank you.</span></div>` : ""}
    <div class="card order-card">
      <div class="order-head">
        <div><h2>${esc(order.name.split(" ")[0] || "Thanks")}, your order is ${esc(order.status)}.</h2>
        <p class="muted">Placed ${esc(fmtDate(order.created_at, tz))} at ${esc(fmtTime(order.created_at, tz))}</p></div>
        ${statusBadge(order.payment_status)}
      </div>
      ${cancelled ? `<div class="notice">This order was cancelled. If that is a surprise, contact us.</div>` : `<ol class="steps">${steps.map(([k, label], i) => `<li class="${i <= idx ? "is-done" : ""}"><span>${i <= idx ? icon("check", { size: 14 }) : i + 1}</span>${esc(label)}</li>`).join("")}</ol>`}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Item</th><th class="ta-right">Qty</th><th class="ta-right">Total</th></tr></thead>
        <tbody>${items.map((it) => `<tr><td>${esc(it.name)}${it.sku ? `<br><small class="muted">${esc(it.sku)}</small>` : ""}</td><td class="ta-right">${it.qty}</td><td class="ta-right">${esc(moneyFmt(it.line_total_cents))}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="totals">
        <p><span>Subtotal</span><span>${esc(moneyFmt(order.subtotal_cents))}</span></p>
        ${order.discount_cents ? `<p><span>Discount ${esc(order.discount_code)}</span><span>−${esc(moneyFmt(order.discount_cents))}</span></p>` : ""}
        ${order.delivery_cents ? `<p><span>Delivery</span><span>${esc(moneyFmt(order.delivery_cents))}</span></p>` : ""}
        ${order.tax_cents ? `<p><span>${esc(cfg.commerce.taxLabel)}</span><span>${esc(moneyFmt(order.tax_cents))}</span></p>` : ""}
        ${order.tip_cents ? `<p><span>Tip</span><span>${esc(moneyFmt(order.tip_cents))}</span></p>` : ""}
        <p class="total-row"><span>Total</span><span>${esc(moneyFmt(order.total_cents))}</span></p>
      </div>
      <div class="order-meta">
        <div><h3>${order.fulfilment === "delivery" ? "Delivery" : "Pickup"}</h3>
          <p>${order.fulfilment === "delivery" ? esc(order.address || "Address on file") : esc(cfg.commerce.pickupInstructions)}</p>
          ${[cfg.business.address1, cfg.business.city].filter(Boolean).length ? `<p class="muted">${esc([cfg.business.address1, cfg.business.city].filter(Boolean).join(", "))}</p>` : ""}
        </div>
        <div><h3>Payment</h3>
          <p>${order.payment_status === "paid" ? "Paid in full." : order.payment_method === "stripe" ? "Card payment pending." : `${esc(cfg.commerce.offlineLabel)} — ${esc(cfg.commerce.offlineInstructions)}`}</p>
        </div>
      </div>
      <p class="fine">Keep this link to check your order. Questions? <a href="mailto:${esc(cfg.business.email)}">${esc(cfg.business.email)}</a></p>
    </div>
  </div></section>`;
}

/* -------------------------------- contact --------------------------------- */

export function renderContact({ csrf, sent = false, error = "", prefill = {}, subject = "" }) {
  const cfg = config();
  return `${pageHeader({ title: "Contact", text: cfg.business.description ? "" : "We usually reply within one business day.", crumbs: [{ label: cfg.business.name, href: "/" }, { label: "Contact" }] })}
  <section class="section"><div class="wrap split">
    <div class="split-copy">
      <h2>Send a message</h2>
      ${sent ? `<div class="flash flash-ok">${icon("check", { size: 18 })}<span>Thanks — your message is in. We will reply by email.</span></div>` : ""}
      ${error ? `<div class="flash flash-error" role="alert">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
      <form method="post" action="/contact" class="form-card form-plain">
        ${csrfField(csrf)}
        <div class="form-row">
          ${field({ name: "name", label: "Name", required: true, value: prefill.name || "", autocomplete: "name" })}
          ${field({ name: "email", label: "Email", required: true, type: "email", value: prefill.email || "", autocomplete: "email" })}
        </div>
        <div class="form-row">
          ${field({ name: "phone", label: "Phone", type: "tel", value: prefill.phone || "", autocomplete: "tel" })}
          ${field({ name: "subject", label: "Subject", value: subject })}
        </div>
        ${field({ name: "message", label: "Message", type: "textarea", required: true, value: "", rows: 6 })}
        <button class="btn btn-primary" type="submit">Send message</button>
        <p class="fine">By sending this you agree that we may reply to the address above.</p>
      </form>
    </div>
    <aside class="split-media contact-panel">
      <h3>${esc(cfg.business.name)}</h3>
      ${businessAddressLines().map((l) => `<p>${esc(l)}</p>`).join("")}
      ${cfg.business.phone ? `<p><a href="tel:${esc(cfg.business.phone.replace(/[^\d+]/g, ""))}">${esc(cfg.business.phone)}</a></p>` : ""}
      ${cfg.business.email ? `<p><a href="mailto:${esc(cfg.business.email)}">${esc(cfg.business.email)}</a></p>` : ""}
      <h3 style="margin-top:1.5rem">Hours</h3>
      ${Object.entries(cfg.hours.hours).map(([k, h]) => `<p class="hours-row"><span>${esc(k.charAt(0).toUpperCase() + k.slice(1))}</span><span>${h.closed ? "Closed" : `${esc(h.open)}–${esc(h.close)}`}</span></p>`).join("")}
      ${cfg.hours.note ? `<p class="hours-note">${esc(cfg.hours.note)}</p>` : ""}
    </aside>
  </div></section>`;
}

/* -------------------------------- account --------------------------------- */

export function renderAccount({ customer = null, orders = [], bookings = [], csrf, error = "", points = 0 }) {
  const cfg = config();
  if (!customer) {
    return `${pageHeader({ title: "Your account", crumbs: [{ label: cfg.business.name, href: "/" }, { label: "Account" }] })}
    <section class="section"><div class="wrap narrow">
      ${error ? `<div class="flash flash-error">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
      <form method="post" action="/account/login" class="form-card">
        ${csrfField(csrf)}
        <h2>Sign in</h2>
        ${field({ name: "email", label: "Email", type: "email", required: true, autocomplete: "email" })}
        ${field({ name: "password", label: "Password", type: "password", required: true, autocomplete: "current-password" })}
        <button class="btn btn-primary" type="submit">Sign in</button>
      </form>
      <form method="post" action="/account/register" class="form-card" style="margin-top:1rem">
        ${csrfField(csrf)}
        <h2>Create an account</h2>
        <p class="muted">Use the email from a previous order or booking.</p>
        ${field({ name: "name", label: "Name", value: "", autocomplete: "name" })}
        ${field({ name: "email", label: "Email", type: "email", required: true, autocomplete: "email" })}
        ${field({ name: "password", label: "Password", type: "password", required: true, help: "At least 10 characters, with a letter and a number.", autocomplete: "new-password" })}
        <button class="btn btn-secondary" type="submit">Create account</button>
      </form>
    </div></section>`;
  }
  return `${pageHeader({ title: `Hello, ${customer.name.split(" ")[0] || "there"}`, crumbs: [{ label: cfg.business.name, href: "/" }, { label: "Account" }] })}
  <section class="section"><div class="wrap">
    <div class="account-grid">
      <div>
        <h2>Orders</h2>
        ${orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th class="ta-right">Total</th></tr></thead><tbody>
          ${orders.map((o) => `<tr><td><a href="/order/${esc(o.token)}">${esc(o.number)}</a></td><td>${esc(fmtDate(o.created_at, cfg.business.timezone))}</td><td>${statusBadge(o.status)}</td><td class="ta-right">${esc(moneyFmt(o.total_cents))}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">No orders yet.</p>`}
      </div>
      <div>
        ${points ? `<div class="side-card"><span class="badge badge-ok">${esc(points)} points</span><p class="fine">Earned on paid orders. Use them at checkout.</p></div>` : ""}
        <h2>Bookings</h2>
        ${bookings.length ? bookings.map((bk) => `<div class="side-card"><strong>${esc(bk.service_name || "Appointment")}</strong><p>${esc(fmtDate(bk.starts_at, cfg.business.timezone))} · ${esc(fmtTime(bk.starts_at, cfg.business.timezone))}</p>${statusBadge(bk.status)}</div>`).join("") : `<p class="muted">No bookings yet.</p>`}
      </div>
    </div>
    <div class="account-actions">
      <form method="post" action="/account/logout">${csrfField(csrf)}<button class="btn btn-secondary" type="submit">Sign out</button></form>
    </div>
  </div></section>`;
}

export { availabilityWindow, addDays, dayOfWeek };
