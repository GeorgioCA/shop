// Public routes: the customer-facing site and its small JSON API.

import express from "express";
import { db } from "../core/db.js";
import { config, tipPresets } from "../core/config.js";
import { isEnabled } from "../core/modules.js";
import { signToken, verifyToken, readCookie, cookieOptions, clearSessionCookie, verifyCsrf } from "../core/auth.js";
import { asyncHandler, rateLimit, setFlash, popFlash } from "../core/http.js";
import { esc, slugify, localDateStr, addDays, fmtDate, fmtTime, money } from "../core/util.js";
import { mediaPath } from "../core/media.js";
import { anyOnlineMode, createCheckoutSession, demoPayments, onlinePaymentsAvailable } from "../core/payments.js";
import { sendOrderConfirmation, sendBookingConfirmation, sendInquiryAck, sendOwnerAlert } from "../core/mail.js";
import { getPage, homePage, publishedPages, sitemapEntries } from "../modules/content.js";
import { listProducts, listCategories, getProduct, productStats } from "../modules/catalog.js";
import { listServices, getService } from "../modules/services.js";
import { createOrder, quote, getOrder } from "../modules/orders.js";
import { evaluateDiscount } from "../modules/discounts.js";
import { createBooking, getBooking, availabilityWindow, availability } from "../modules/bookings.js";
import { createInquiry } from "../modules/inquiries.js";
import { createReview, approvedReviews, reviewSummary } from "../modules/reviews.js";
import { subscribe } from "../modules/newsletter.js";
import { getCustomer, verifyCustomer, customerOrders, customerBookings, customerPoints, createCustomerAccount } from "../modules/customers.js";
import { siteLayout } from "../views/layout.js";
import {
  renderHome, renderContentPage, renderCatalog, renderProduct, renderServices, renderService,
  renderBooking, renderCheckout, renderOrder, renderContact, renderAccount, localBusinessJsonLd, pageHeader
} from "../views/site.js";
import { esc as e } from "../core/util.js";

const CUSTOMER_COOKIE = "shop_customer";
const moneyFmt = (c) => money(c, config().business.currency, config().business.locale);

export const site = express.Router();

/* ------------------------------ customer session --------------------------- */

site.use((req, res, next) => {
  req.customer = null;
  const token = readCookie(req, CUSTOMER_COOKIE);
  const payload = token ? verifyToken(token) : null;
  if (payload?.cid) {
    const c = getCustomer(payload.cid);
    if (c?.password_hash) req.customer = c;
  }
  res.locals.customer = req.customer;
  next();
});

const page = (req, res, html, opts = {}) =>
  res.send(siteLayout({
    ...opts, body: html, csrf: res.locals.csrf, flash: popFlash(req, res),
    canonical: opts.canonical || (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}${req.path}` : "")
  }));

/* --------------------------------- home ----------------------------------- */

site.get("/", (req, res) => {
  const home = homePage();
  if (!home) {
    return page(req, res, renderHome(null), { title: "Home", csrf: res.locals.csrf });
  }
  page(req, res, renderHome(home), {
    title: home.seo_title || "",
    description: home.seo_description,
    jsonLd: localBusinessJsonLd(),
    active: "/"
  });
});

site.get("/p/:slug", (req, res, next) => {
  const pg = getPage(req.params.slug);
  if (!pg || pg.is_home) return next();
  if (pg.status !== "published") return next();
  page(req, res, renderContentPage(pg), {
    title: pg.seo_title || pg.title,
    description: pg.seo_description,
    canonical: `${process.env.PUBLIC_BASE_URL || ""}/p/${pg.slug}`,
    active: `/p/${pg.slug}`
  });
});

/* -------------------------------- catalog --------------------------------- */

site.get(["/shop", "/menu"], (req, res, next) => {
  if (!isEnabled("catalog")) return next();
  const cfg = config();
  const cats = listCategories("product");
  const active = String(req.query.category || "");
  const query = String(req.query.q || "").slice(0, 80);
  const cat = cats.find((c) => c.slug === active);
  let products = listProducts({ activeOnly: true, categoryId: cat?.id || "", search: query, limit: 120 });
  // Variant groups collapse to one card, represented by their cheapest member.
  const groups = new Map();
  const out = [];
  for (const p of products) {
    if (!p.variant_group) { out.push(p); continue; }
    const key = p.variant_group;
    if (!groups.has(key)) { groups.set(key, p); out.push(p); }
    else {
      const idx = out.indexOf(groups.get(key));
      if (p.price_now < groups.get(key).price_now) out[idx] = p, groups.set(key, p);
    }
  }
  page(req, res, renderCatalog({ products: out, categories: cats, activeCategory: active, query, total: out.length }), {
    title: cfg.catalog.productsLabel,
    description: cfg.site.seoDescription || cfg.business.description,
    active: "/shop"
  });
});

site.get("/product/:slug", (req, res, next) => {
  if (!isEnabled("catalog")) return next();
  const product = getProduct(req.params.slug);
  if (!product || !product.active) return next();
  const members = product.variant_group
    ? listProducts({ activeOnly: true }).filter((p) => p.variant_group === product.variant_group)
    : [product];
  const reviews = isEnabled("reviews") ? approvedReviews(product.id) : [];
  const avg = isEnabled("reviews") ? reviewSummary(product.id) : { count: 0, average: 0 };
  const related = listProducts({ activeOnly: true, categoryId: product.category_id, limit: 4 }).filter((p) => p.id !== product.id).slice(0, 3);
  page(req, res, renderProduct({ product, members, reviews, reviewAvg: avg, csrf: res.locals.csrf, related }), {
    title: product.name,
    description: product.short_desc || product.description.slice(0, 200),
    canonical: `${process.env.PUBLIC_BASE_URL || ""}/product/${product.slug}`,
    active: "/shop"
  });
});

site.post("/product/:slug/review", (req, res, next) => {
  if (!isEnabled("reviews")) return next();
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh and try again.");
  const product = getProduct(req.params.slug);
  if (!product) return next();
  try {
    createReview({ ...req.body, product_id: product.id });
    setFlash(res, "success", "Thanks — your review is waiting for moderation.");
  } catch (err) {
    setFlash(res, "error", err.message);
  }
  res.redirect(`/product/${product.slug}#reviews`);
});

/* -------------------------------- services -------------------------------- */

site.get("/services", (req, res, next) => {
  if (!isEnabled("services")) return next();
  const cats = listCategories("service");
  const active = String(req.query.category || "");
  const cat = cats.find((c) => c.slug === active);
  const services = listServices({ activeOnly: true }).filter((s) => !cat || s.category_id === cat.id);
  page(req, res, renderServices({ services, categories: cats, activeCategory: active }), {
    title: config().catalog.servicesLabel,
    active: "/services"
  });
});

site.get("/services/:slug", (req, res, next) => {
  if (!isEnabled("services")) return next();
  const service = getService(req.params.slug);
  if (!service || !service.active) return next();
  const related = listServices({ activeOnly: true }).filter((s) => s.id !== service.id).slice(0, 3);
  page(req, res, renderService({ service, related }), { title: service.name, description: service.short_desc, active: "/services" });
});

/* -------------------------------- bookings -------------------------------- */

site.get("/book", (req, res, next) => {
  if (!isEnabled("bookings")) return next();
  const cfg = config();
  const services = listServices({ activeOnly: true });
  const service = req.query.service ? getService(String(req.query.service)) : null;
  if (!service) {
    return page(req, res, renderBooking({ services, csrf: res.locals.csrf }), { title: "Book", active: "/book" });
  }
  const tz = cfg.business.timezone;
  const today = localDateStr(new Date(), tz);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : today;
  const day = availability(service, date);
  const days = availabilityWindow(service, 14, today);
  page(req, res, renderBooking({ services, service, date, days, day, csrf: res.locals.csrf, error: String(req.query.error || "") }), {
    title: `Book ${service.name}`,
    active: "/book"
  });
});

site.post("/book", asyncHandler(async (req, res) => {
  if (!isEnabled("bookings")) return res.status(404).send("Not available.");
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh and try again.");
  const service = getService(String(req.body.service_id || ""));
  try {
    const booking = createBooking(req.body);
    const url = `${process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`}/booking/${booking.token}`;
    if (config().email.bookingConfirmation) sendBookingConfirmation(booking, service, url);
    sendOwnerAlert("New booking", [`${booking.name} · ${booking.service_name}`, new Date(booking.starts_at).toISOString()], `${process.env.PUBLIC_BASE_URL || ""}/admin/bookings`);
    res.redirect(`/booking/${booking.token}`);
  } catch (err) {
    const back = `/book?service=${encodeURIComponent(service?.id || "")}&date=${encodeURIComponent(String(req.body.date || ""))}&error=${encodeURIComponent(err.message)}`;
    res.redirect(back);
  }
}));

site.get("/booking/:token", (req, res, next) => {
  if (!isEnabled("bookings")) return next();
  const booking = getBooking(req.params.token);
  if (!booking) return next();
  const cfg = config();
  const tz = cfg.business.timezone;
  const body = `${pageHeader({ title: booking.status === "confirmed" ? "You're booked" : "Request received", crumbs: [{ label: cfg.business.name, href: "/" }, { label: "Booking" }] })}
    <section class="section section-tight"><div class="wrap narrow"><div class="card"><div class="card-pad">
      <div class="flash flash-ok">${booking.status === "confirmed" ? "Confirmed — a copy is in your inbox." : "We will confirm by email shortly."}</div>
      <h2>${esc(booking.service_name)}</h2>
      <p class="lede">${esc(fmtDate(booking.starts_at, tz, { weekday: "long", month: "long", day: "numeric" }))} at ${esc(fmtTime(booking.starts_at, tz))}</p>
      <dl class="detail-list">
        <div><dt>Booking</dt><dd>${esc(booking.number)}</dd></div>
        <div><dt>Name</dt><dd>${esc(booking.name)}</dd></div>
        <div><dt>Status</dt><dd>${esc(booking.status)}</dd></div>
        ${booking.notes ? `<div><dt>Notes</dt><dd>${esc(booking.notes)}</dd></div>` : ""}
      </dl>
      <p class="muted">Need to change it? Reply to the confirmation email or <a href="/contact">contact us</a>.</p>
      <p><a class="btn btn-secondary" href="/">Back to ${esc(cfg.business.name)}</a></p>
    </div></div></div></section>`;
  page(req, res, body, { title: "Booking", noindex: true, csrf: res.locals.csrf });
});

/* -------------------------------- checkout -------------------------------- */

site.get("/checkout", (req, res, next) => {
  if (!isEnabled("commerce")) return next();
  const points = req.customer && isEnabled("loyalty") ? { available: customerPoints(req.customer.id) } : null;
  page(req, res, renderCheckout({ csrf: res.locals.csrf, customer: req.customer, points }), { title: "Checkout", noindex: true });
});

site.post("/api/quote", (req, res) => {
  if (!isEnabled("commerce")) return res.status(404).json({ error: "Not available" });
  const q = quote({
    items: req.body?.items,
    fulfilment: req.body?.fulfilment,
    code: req.body?.code,
    tipCents: req.body?.tip_cents,
    pointsToUse: req.body?.use_points ? Number(req.body?.points || 0) : 0,
    customer: req.customer
  });
  if (!q.ok) return res.status(400).json({ error: q.error });
  res.json({
    ok: true,
    subtotal_cents: q.subtotalCents,
    discount_cents: q.discountCents,
    discount_code: q.discountCode,
    points_cents: q.pointsCents,
    points_used: q.pointsUsed,
    delivery_cents: q.deliveryCents,
    tax_cents: q.taxCents,
    tip_cents: q.tipCents,
    total_cents: q.totalCents,
    fulfilment: q.fulfilment,
    lines: q.lines.map((l) => ({ name: l.name, qty: l.qty, unit_price_cents: l.unit_price_cents, line_total_cents: l.line_total_cents }))
  });
});

site.get("/api/discount", (req, res) => {
  if (!isEnabled("promotions")) return res.status(404).json({ error: "Not available" });
  const subtotal = Number(req.query.subtotal) || 0;
  const result = evaluateDiscount(String(req.query.code || ""), subtotal);
  res.json(result);
});

site.get("/api/availability", (req, res) => {
  if (!isEnabled("bookings")) return res.status(404).json({ error: "Not available" });
  const service = getService(String(req.query.service || ""));
  if (!service) return res.status(404).json({ error: "Unknown service" });
  const date = String(req.query.date || localDateStr(new Date(), config().business.timezone));
  res.json(availability(service, date));
});

site.post("/api/checkout", rateLimit({ windowMs: 60_000, max: 12, message: "Too many checkout attempts. Please wait a minute." }), asyncHandler(async (req, res) => {
  if (!isEnabled("commerce")) return res.status(404).json({ error: "Not available" });
  if (!verifyCsrf(req)) return res.status(403).json({ error: "Session expired. Refresh the page and try again." });
  const body = req.body || {};
  const cfg = config();
  const method = body.payment_method === "stripe" ? "stripe" : "offline";
  if (method === "stripe" && !anyOnlineMode()) return res.status(400).json({ error: "Card payment is not available." });
  if (method === "offline" && !cfg.commerce.offlinePayments) return res.status(400).json({ error: "Choose a payment method." });

  if (!String(body.name || "").trim()) return res.status(400).json({ error: "Enter your name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(body.email || ""))) return res.status(400).json({ error: "Enter a valid email." });
  if ((cfg.commerce.requirePhone || body.fulfilment === "delivery") && !String(body.phone || "").trim()) {
    return res.status(400).json({ error: "A phone number is required." });
  }
  if (body.fulfilment === "delivery" && String(body.address || "").trim().length < 8) {
    return res.status(400).json({ error: "Enter a delivery address." });
  }
  if (body.fulfilment !== "delivery" && !cfg.commerce.pickupEnabled) {
    return res.status(400).json({ error: "Pickup is not available. Please choose delivery." });
  }

  const cart = Array.isArray(body.items) ? body.items : [];
  if (!cart.length) return res.status(400).json({ error: "Your cart is empty." });

  try {
    if (method === "stripe" && onlinePaymentsAvailable()) {
      const order = createOrder({
        ...body, items: cart, payment_method: "stripe", paid: false,
        tipCents: Number(body.tip_cents) || 0,
        pointsToUse: body.use_points ? customerPoints(req.customer?.id) : 0
      });
      const origin = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const session = await createCheckoutSession({
        order,
        items: order.items,
        successUrl: `${origin}/order/${order.token}?paid=1`,
        cancelUrl: `${origin}/checkout?cancelled=1`
      });
      db.prepare("UPDATE orders SET stripe_session = ? WHERE id = ?").run(session.id, order.id);
      return res.json({ url: session.url });
    }

    const demo = method === "stripe" && demoPayments();
    const order = createOrder({
      ...body, items: cart, payment_method: method === "stripe" ? "stripe" : "offline",
      paid: demo,
      tipCents: Number(body.tip_cents) || 0,
      pointsToUse: body.use_points ? customerPoints(req.customer?.id) : 0
    });
    const origin = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    sendOrderConfirmation(order, order.items, `${origin}/order/${order.token}`);
    sendOwnerAlert("New order", [`${order.number} · ${order.name}`, `${order.items.length} line(s)`, moneyFmt(order.total_cents)], `${origin}/admin/orders/${order.number}`);
    res.json({ url: `/order/${order.token}${demo ? "?paid=1" : ""}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

site.get("/order/:token", (req, res, next) => {
  if (!isEnabled("commerce")) return next();
  const order = getOrder(req.params.token);
  if (!order) return next();
  page(req, res, renderOrder({ order, items: order.items, justPaid: req.query.paid === "1" }), {
    title: `Order ${order.number}`, noindex: true, csrf: res.locals.csrf
  });
});

/* -------------------------------- contact --------------------------------- */

site.get("/contact", (req, res, next) => {
  if (!isEnabled("inquiries")) return next();
  page(req, res, renderContact({ csrf: res.locals.csrf, sent: req.query.sent === "1", subject: String(req.query.subject || "") }), {
    title: "Contact", active: "/contact"
  });
});

site.post("/contact", rateLimit({ windowMs: 60_000, max: 6 }), asyncHandler(async (req, res) => {
  if (!isEnabled("inquiries")) return res.status(404).send("Not available.");
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh and try again.");
  try {
    const inquiry = createInquiry({ ...req.body, source: "contact" });
    sendInquiryAck(inquiry);
    sendOwnerAlert("New inquiry", [`${inquiry.name} · ${inquiry.email}`, inquiry.subject], `${process.env.PUBLIC_BASE_URL || ""}/admin/inquiries/${inquiry.id}`);
    res.redirect("/contact?sent=1");
  } catch (err) {
    page(req, res.status(400), renderContact({ csrf: res.locals.csrf, error: err.message, prefill: req.body }), { title: "Contact", active: "/contact" });
  }
}));

site.post("/newsletter", rateLimit({ windowMs: 60_000, max: 5 }), (req, res) => {
  if (!isEnabled("newsletter")) return res.status(404).send("Not available.");
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh and try again.");
  try {
    const { already } = subscribe(req.body?.email, req.body?.name, "footer");
    setFlash(res, "success", already ? "You are already on the list." : "Subscribed. Thanks!");
  } catch (err) {
    setFlash(res, "error", err.message);
  }
  res.redirect(req.get("referer") || "/");
});

/* -------------------------------- account --------------------------------- */

site.get("/account", (req, res, next) => {
  if (!isEnabled("accounts")) return next();
  const orders = req.customer ? customerOrders(req.customer.id) : [];
  const bookings = req.customer ? customerBookings(req.customer.id) : [];
  page(req, res, renderAccount({
    customer: req.customer, orders, bookings, csrf: res.locals.csrf,
    error: String(req.query.error || ""),
    points: req.customer && isEnabled("loyalty") ? customerPoints(req.customer.id) : 0
  }), { title: "Your account", noindex: true });
});

site.post("/account/login", rateLimit({ windowMs: 60_000, max: 8 }), (req, res) => {
  if (!isEnabled("accounts")) return res.status(404).send("Not available.");
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh and try again.");
  const customer = verifyCustomer(req.body?.email, req.body?.password);
  if (!customer) return res.redirect("/account?error=" + encodeURIComponent("That email and password do not match."));
  res.cookie(CUSTOMER_COOKIE, signToken({ cid: customer.id }, 30 * 86400_000), cookieOptions(req, 30 * 86400_000));
  res.redirect("/account");
});

site.post("/account/register", rateLimit({ windowMs: 60_000, max: 6 }), (req, res) => {
  if (!isEnabled("accounts")) return res.status(404).send("Not available.");
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh and try again.");
  try {
    const customer = createCustomerAccount(String(req.body?.email || ""), String(req.body?.password || ""), String(req.body?.name || ""));
    res.cookie(CUSTOMER_COOKIE, signToken({ cid: customer.id }, 30 * 86400_000), cookieOptions(req, 30 * 86400_000));
    res.redirect("/account");
  } catch (err) {
    res.redirect(`/account?error=${encodeURIComponent(err.message)}`);
  }
});

site.post("/account/logout", (req, res) => {
  if (!verifyCsrf(req)) return res.status(403).send("Session expired.");
  clearSessionCookie(res);
  res.clearCookie(CUSTOMER_COOKIE, { path: "/" });
  res.redirect("/");
});

/* --------------------------------- assets --------------------------------- */

site.get("/media/:file", (req, res, next) => {
  const file = String(req.params.file || "");
  if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return next();
  res.sendFile(mediaPath(file), { maxAge: "30d", immutable: true }, (err) => { if (err) next(); });
});

site.get("/sitemap.xml", (req, res) => {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const urls = sitemapEntries().filter((u) =>
    (!u.url.startsWith("/product/") || isEnabled("catalog")) &&
    (!u.url.startsWith("/services") || isEnabled("services"))
  );
  if (isEnabled("services")) urls.push({ url: "/services", changefreq: "monthly", priority: "0.8" });
  if (isEnabled("inquiries")) urls.push({ url: "/contact", changefreq: "yearly", priority: "0.5" });
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${e(base + u.url)}</loc>${u.lastmod ? `<lastmod>${e(u.lastmod)}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n") +
    `\n</urlset>`
  );
});

site.get("/robots.txt", (req, res) => {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /order/\nDisallow: /account\nSitemap: ${base}/sitemap.xml\n`);
});

export default site;
