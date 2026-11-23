// Page shells. The same theme tokens drive the public site and transactional
// email, so a colour change is visible everywhere at once.

import { db } from "../core/db.js";
import { config, socialLinks, businessAddressLines, DAYS } from "../core/config.js";
import { isEnabled } from "../core/modules.js";
import { mediaUrl } from "../core/media.js";
import { esc, money } from "../core/util.js";
import { icon, flashMessage, avatar } from "./components.js";
import { can } from "../core/auth.js";
import { demoPayments } from "../core/payments.js";
import { asset } from "../core/assets.js";

const FONTS = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  rounded: 'ui-rounded, "Avenir Next", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
};

const RADII = { sharp: "3px", soft: "12px", round: "22px" };

export function themeCss() {
  const t = config().theme;
  return `:root{
  --c-primary:${t.primary};--c-primary-text:${t.primaryText};--c-accent:${t.accent};
  --c-bg:${t.background};--c-surface:${t.surface};--c-text:${t.text};--c-muted:${t.muted};--c-border:${t.border};
  --radius:${RADII[t.radius] || RADII.soft};
  --font-head:${FONTS[t.headingFont] || FONTS.serif};
  --font-body:${FONTS[t.bodyFont] || FONTS.sans};
}`;
}

export const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf || "")}">`;

/* ---------------------------------- nav ---------------------------------- */

export function headerLinks() {
  const cfg = config();
  const rows = db.prepare("SELECT * FROM nav_items WHERE location = 'header' AND visible = 1 ORDER BY sort, label").all();
  const links = rows.map((r) => ({ label: r.label, url: r.url }));
  const seen = new Set(links.map((l) => l.url));
  const auto = [];
  if (isEnabled("catalog") && db.prepare("SELECT 1 FROM products WHERE active = 1 LIMIT 1").get()) {
    auto.push({ label: cfg.catalog.productsLabel, url: "/shop" });
  }
  if (isEnabled("services") && db.prepare("SELECT 1 FROM services WHERE active = 1 LIMIT 1").get()) {
    auto.push({ label: cfg.catalog.servicesLabel, url: "/services" });
  }
  if (isEnabled("bookings")) auto.push({ label: "Book", url: "/book" });
  if (isEnabled("inquiries")) auto.push({ label: "Contact", url: "/contact" });
  for (const link of auto) if (!seen.has(link.url)) { links.push(link); seen.add(link.url); }
  return links;
}

export function footerLinks() {
  return db.prepare("SELECT * FROM nav_items WHERE location = 'footer' AND visible = 1 ORDER BY sort, label").all()
    .map((r) => ({ label: r.label, url: r.url }));
}

/* --------------------------------- layout -------------------------------- */

export function siteLayout({
  title, description = "", body, active = "", canonical = "", noindex = false, jsonLd = null, bodyClass = "", csrf = "", flash = null, nonce = ""
}) {
  const cfg = config();
  const b = cfg.business;
  const s = cfg.site;
  const n = nonce ? ` nonce="${esc(nonce)}"` : "";
  const fullTitle = title ? `${title} · ${b.name}` : (s.seoTitle || `${b.name}${b.tagline ? ` — ${b.tagline}` : ""}`);
  const desc = description || s.seoDescription || b.description || "";
  const logo = cfg.theme.logo;
  const nav = headerLinks();
  const foot = footerLinks();
  const socials = socialLinks();
  const cartOn = isEnabled("commerce");
  const announcement = s.announcement
    ? `<div class="announce">${s.announcementUrl ? `<a href="${esc(s.announcementUrl)}">${esc(s.announcement)}</a>` : esc(s.announcement)}</div>`
    : "";
  const cta = s.ctaLabel && s.ctaUrl ? `<a class="btn btn-primary btn-sm nav-cta" href="${esc(s.ctaUrl)}">${esc(s.ctaLabel)}</a>` : "";

  return `<!doctype html>
<html lang="${esc((b.locale || "en-CA").slice(0, 2))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc.slice(0, 300))}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(b.name)}">
<meta property="og:title" content="${esc(title || b.name)}">
<meta property="og:description" content="${esc(desc.slice(0, 300))}">
${cfg.theme.ogImage ? `<meta property="og:image" content="${esc(mediaUrl(cfg.theme.ogImage))}">` : ""}
<meta name="theme-color" content="${esc(cfg.theme.primary)}">
${cfg.theme.favicon ? `<link rel="icon" href="${esc(mediaUrl(cfg.theme.favicon))}">` : cfg.theme.logo ? `<link rel="icon" href="${esc(mediaUrl(cfg.theme.logo))}">` : ""}
<link rel="stylesheet" href="${asset("/styles.css")}">
<style>${themeCss()}</style>
${jsonLd ? `<script type="application/ld+json"${n}>${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
${cartScriptConfig(nonce)}
</head>
<body class="${esc(bodyClass)}">
<a class="skip" href="#main">Skip to content</a>
${announcement}
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${esc(b.name)} home">
      ${logo ? `<img src="${esc(mediaUrl(logo))}" alt="${esc(b.name)}" class="brand-logo">` : `<span class="brand-mark" aria-hidden="true">${esc((b.name || "S").slice(0, 1))}</span><span class="brand-name">${esc(b.name)}</span>`}
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
      <span class="sr-only">Menu</span>${icon("menu", { size: 24 })}
    </button>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      ${nav.map((l) => `<a href="${esc(l.url)}" ${active === l.url ? 'aria-current="page"' : ""}>${esc(l.label)}</a>`).join("")}
      ${cta}
      ${cartOn ? `<button class="cart-button" type="button" data-cart-open aria-label="Open cart">${icon("cart", { size: 21 })}<span class="cart-count" data-cart-count hidden>0</span></button>` : ""}
      ${isEnabled("accounts") ? `<a class="nav-account" href="/account" aria-label="Your account">${icon("users", { size: 20 })}</a>` : ""}
    </nav>
  </div>
</header>
${flash ? `<div class="wrap flash-wrap">${flashMessage(flash)}</div>` : ""}
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <p class="footer-name">${esc(b.name)}</p>
      ${b.description ? `<p class="footer-desc">${esc(b.description)}</p>` : ""}
      <div class="footer-contact">
        ${b.phone ? `<a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${icon("phone", { size: 16 })} ${esc(b.phone)}</a>` : ""}
        ${b.email ? `<a href="mailto:${esc(b.email)}">${icon("mail", { size: 16 })} ${esc(b.email)}</a>` : ""}
        ${b.address1 ? `<span>${icon("pin", { size: 16 })} ${esc(businessAddressLines().join(", "))}</span>` : ""}
      </div>
      ${socials.length ? `<div class="socials">${socials.map(([name, url]) => `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(name)}</a>`).join("")}</div>` : ""}
    </div>
    <div class="footer-col">
      <p class="footer-head">Explore</p>
      ${nav.map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join("")}
      ${foot.map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join("")}
    </div>
    <div class="footer-col">
      <p class="footer-head">Hours</p>
      ${DAYS.map(([key, label]) => {
        const h = cfg.hours.hours[key];
        return `<p class="hours-row"><span>${esc(label.slice(0, 3))}</span><span>${h.closed ? "Closed" : `${esc(h.open)}–${esc(h.close)}`}</span></p>`;
      }).join("")}
      ${cfg.hours.note ? `<p class="hours-note">${esc(cfg.hours.note)}</p>` : ""}
    </div>
    ${isEnabled("newsletter") ? `<div class="footer-col footer-news">
      <p class="footer-head">News</p>
      <p class="footer-desc">Occasional updates. No spam.</p>
      <form method="post" action="/newsletter" class="news-form">
        ${csrfField(csrf)}
        <label class="sr-only" for="nl-email">Email</label>
        <input class="input" id="nl-email" type="email" name="email" placeholder="you@example.com" required>
        <button class="btn btn-primary btn-sm" type="submit">Join</button>
      </form>
    </div>` : ""}
  </div>
  <div class="wrap footer-bottom">
    <p>© ${new Date().getFullYear()} ${esc(b.legalName || b.name)}. All rights reserved.</p>
    ${cfg.site.footerText ? `<p class="footer-fine">${esc(cfg.site.footerText)}</p>` : ""}
  </div>
</footer>
${cartOn ? cartDrawer() : ""}
<script src="${asset("/app.js")}"${n} defer></script>
</body></html>`;
}

function cartDrawer() {
  const c = config().commerce;
  return `<div class="cart-backdrop" data-cart-close hidden></div>
<aside class="cart-drawer" id="cart" aria-label="Cart" aria-hidden="true">
  <div class="cart-head"><h2>Your cart</h2><button class="icon-btn" type="button" data-cart-close aria-label="Close cart">${icon("close")}</button></div>
  <div class="cart-body" data-cart-items></div>
  <div class="cart-foot">
    <div class="cart-total"><span>Subtotal</span><strong data-cart-total>—</strong></div>
    <p class="cart-note">${esc(c.minOrderCents ? `Minimum order ${money(c.minOrderCents, config().business.currency, config().business.locale)}.` : "Taxes and delivery are calculated at checkout.")}</p>
    <a class="btn btn-primary btn-block" href="/checkout" data-cart-checkout>Checkout</a>
    <button class="btn btn-ghost btn-block" type="button" data-cart-close>Keep shopping</button>
  </div>
</aside>`;
}

export function cartScriptConfig(nonce = "") {
  const c = config();
  return `<script${nonce ? ` nonce="${esc(nonce)}"` : ""}>window.__SHOP__=${JSON.stringify({
    currency: c.business.currency,
    locale: c.business.locale,
    minOrderCents: c.commerce.minOrderCents,
    maxItems: 50
  }).replace(/</g, "\\u003c")};</script>`;
}

/* ------------------------------- admin shell ------------------------------ */

const ADMIN_NAV = [
  {
    group: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", iconName: "grid", perm: "dashboard.view", exact: true },
      { href: "/admin/orders", label: "Orders", iconName: "cart", perm: "orders.view", module: "commerce" },
      { href: "/admin/bookings", label: "Bookings", iconName: "calendar", perm: "bookings.view", module: "bookings" },
      { href: "/admin/inquiries", label: "Inquiries", iconName: "mail", perm: "inquiries.manage", module: "inquiries" }
    ]
  },
  {
    group: "Sell",
    items: [
      { href: "/admin/products", label: "Products", iconName: "box", perm: "catalog.manage", module: "catalog" },
      { href: "/admin/categories", label: "Categories", iconName: "tag", perm: "catalog.manage", module: "catalog" },
      { href: "/admin/services", label: "Services", iconName: "clock", perm: "services.manage", module: "services" },
      { href: "/admin/discounts", label: "Discounts", iconName: "tag", perm: "discounts.manage", module: "promotions" },
      { href: "/admin/customers", label: "Customers", iconName: "users", perm: "customers.view" },
      { href: "/admin/reviews", label: "Reviews", iconName: "star", perm: "reviews.manage", module: "reviews" },
      { href: "/admin/newsletter", label: "Subscribers", iconName: "mail", perm: "content.manage", module: "newsletter" }
    ]
  },
  {
    group: "Website",
    items: [
      { href: "/admin/pages", label: "Pages", iconName: "layout", perm: "content.manage", module: "content" },
      { href: "/admin/settings/site", label: "Header & SEO", iconName: "settings", perm: "settings.manage" },
      { href: "/admin/navigation", label: "Navigation", iconName: "menu", perm: "content.manage", module: "content" },
      { href: "/admin/faqs", label: "FAQs", iconName: "help", perm: "content.manage", module: "content" },
      { href: "/admin/testimonials", label: "Testimonials", iconName: "star", perm: "content.manage", module: "content" },
      { href: "/admin/media", label: "Media", iconName: "image", perm: "media.manage" },
      { href: "/admin/theme", label: "Appearance", iconName: "settings", perm: "theme.manage" }
    ]
  },
  {
    group: "Settings",
    items: [
      { href: "/admin/settings/business", label: "Business", iconName: "settings", perm: "settings.manage" },
      { href: "/admin/settings/hours", label: "Hours", iconName: "clock", perm: "settings.manage" },
      { href: "/admin/settings/catalog", label: "Catalog labels", iconName: "tag", perm: "settings.manage", module: "catalog" },
      { href: "/admin/settings/commerce", label: "Orders & payments", iconName: "cart", perm: "settings.manage", module: "commerce" },
      { href: "/admin/settings/bookings", label: "Booking rules", iconName: "calendar", perm: "settings.manage", module: "bookings" },
      { href: "/admin/settings/email", label: "Email", iconName: "mail", perm: "settings.manage" },
      { href: "/admin/modules", label: "Modules", iconName: "grid", perm: "modules.manage" },
      { href: "/admin/users", label: "Users", iconName: "users", perm: "users.manage" },
      { href: "/admin/setup", label: "Setup wizard", iconName: "check", perm: "settings.manage" }
    ]
  }
];

export function adminNav(user) {
  return ADMIN_NAV.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => can(user, i.perm) && (!i.module || isEnabled(i.module)))
  })).filter((g) => g.items.length);
}

export function adminLayout({
  title, body, active = "", user, flash = null, breadcrumbs = [], wide = false, subtitle = "", actions = "", csrf = "", nonce = ""
}) {
  const cfg = config();
  const b = cfg.business;
  const groups = adminNav(user);
  const setupIncomplete = !cfg.setup.completed;
  const n = nonce ? ` nonce="${esc(nonce)}"` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(b.name)} admin</title>
<meta name="robots" content="noindex,nofollow">
${cfg.theme.favicon ? `<link rel="icon" href="${esc(mediaUrl(cfg.theme.favicon))}">` : ""}
<link rel="stylesheet" href="${asset("/styles.css")}">
<link rel="stylesheet" href="${asset("/admin.css")}">
<style>${themeCss()}</style>
</head>
<body class="admin-body">
<a class="skip" href="#admin-main">Skip to content</a>
<div class="admin-shell">
  <aside class="admin-sidebar" id="admin-sidebar">
    <div class="admin-brand">
      <a href="/admin" class="admin-brand-link">
        <span class="admin-mark" aria-hidden="true">${esc((b.name || "S").slice(0, 1))}</span>
        <span class="admin-brand-text"><strong>${esc(b.name)}</strong><small>${esc(b.category || "Business platform")}</small></span>
      </a>
    </div>
    ${setupIncomplete ? `<a class="setup-nudge" href="/admin/setup">${icon("check", { size: 16 })} Finish setting up</a>` : ""}
    <nav class="admin-nav" aria-label="Admin">
      ${groups.map((g) => `<div class="admin-nav-group"><p>${esc(g.group)}</p>${g.items
        .map((i) => {
          const isActive = i.exact ? active === i.href : active.startsWith(i.href);
          return `<a href="${esc(i.href)}" class="${isActive ? "is-active" : ""}" ${isActive ? 'aria-current="page"' : ""}>${icon(i.iconName, { size: 18 })}<span>${esc(i.label)}</span></a>`;
        })
        .join("")}</div>`).join("")}
    </nav>
    <div class="admin-side-foot">
      <a href="/" target="_blank" rel="noopener">${icon("external", { size: 16 })} View site</a>
      <form method="post" action="/admin/logout">${csrfField(csrf)}
        <button class="linkbtn" type="submit">Sign out</button>
      </form>
    </div>
  </aside>
  <div class="admin-main" id="admin-main">
    <header class="admin-topbar">
      <button class="icon-btn admin-menu-btn" type="button" data-admin-nav aria-label="Toggle menu">${icon("menu")}</button>
      <div class="admin-crumbs">${breadcrumbs.map((c, i) => `${i ? '<span aria-hidden="true">/</span>' : ""}${c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`}`).join("")}</div>
      <div class="admin-user">${avatar(user?.name || "?", { size: 30 })}<span>${esc(user?.name || "")}</span></div>
    </header>
    <div class="admin-content ${wide ? "wide" : ""}">
      ${flashMessage(flash)}
      ${demoPayments() ? `<div class="callout callout-warn"><div><strong>Demo payment mode is on.</strong> Card checkouts are simulated and every order arrives as paid. Disable <code>PAYMENTS_DEMO</code> / <code>DEMO_MODE</code> before going live.</div></div>` : ""}
      <div class="page-head">
        <div><h1>${esc(title)}</h1>${subtitle ? `<p class="page-sub">${esc(subtitle)}</p>` : ""}</div>
        ${actions ? `<div class="page-actions">${actions}</div>` : ""}
      </div>
      ${body}
    </div>
  </div>
</div>
<script src="${asset("/admin.js")}"${n} defer></script>
</body></html>`;
}
