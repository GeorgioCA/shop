// Admin surfaces built from the configuration schema: one renderer, every
// settings screen, so a new setting appears in exactly one place.

import { config, SCHEMA, DAYS, CURRENCIES, LOCALES } from "../../core/config.js";
import { isEnabled } from "../../core/modules.js";
import { esc, money, centsInput, fmtDate } from "../../core/util.js";
import { icon, field, button, flashMessage, badge, emptyState, statTile, statusBadge } from "../components.js";
import { mediaUrl } from "../../core/media.js";
import { csrfField } from "../layout.js";

const moneyFmt = (c) => money(c, config().business.currency, config().business.locale);

/* ------------------------------ login / setup ----------------------------- */

export function renderLogin({ error = "", next = "/admin", businessName = "", hasUsers = true }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · ${esc(businessName || "Admin")}</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin.css"></head>
<body class="auth-body">
<main class="auth-card">
  <div class="auth-brand"><span class="admin-mark">${esc((businessName || "S").slice(0, 1))}</span><strong>${esc(businessName || "Your business")}</strong></div>
  <h1>Sign in</h1>
  <p class="muted">Back office access.</p>
  ${flashMessage(error ? { type: "error", message: error } : null)}
  ${hasUsers ? `<form method="post" action="/admin/login" class="form-card form-plain">
    <input type="hidden" name="next" value="${esc(next)}">
    ${field({ name: "email", label: "Email", type: "email", required: true, autocomplete: "username" })}
    ${field({ name: "password", label: "Password", type: "password", required: true, autocomplete: "current-password" })}
    <button class="btn btn-primary btn-block" type="submit">Sign in</button>
  </form>` : `<div class="notice">No admin account exists yet. <a href="/setup">Run the setup</a>.</div>`}
  <p class="auth-foot"><a href="/">← Back to the site</a></p>
</main></body></html>`;
}

export function renderFirstRun({ error = "", values = {} }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Set up your business</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin.css"></head>
<body class="auth-body">
<main class="auth-card auth-wide">
  <div class="auth-brand"><span class="admin-mark">S</span><strong>New installation</strong></div>
  <h1>Set up your business</h1>
  <p class="muted">Create the owner account. You can configure everything else — industry, branding, catalog — from the admin panel afterwards.</p>
  ${error ? flashMessage({ type: "error", message: error }) : ""}
  <form method="post" action="/setup" class="form-card form-plain">
    ${field({ name: "business_name", label: "Business name", required: true, value: values.business_name || "", placeholder: "e.g. Juniper Kitchen" })}
    ${field({ name: "name", label: "Your name", required: true, value: values.name || "", autocomplete: "name" })}
    ${field({ name: "email", label: "Your email", type: "email", required: true, value: values.email || "", autocomplete: "email" })}
    ${field({ name: "password", label: "Password", type: "password", required: true, help: "At least 10 characters, with a letter and a number.", autocomplete: "new-password" })}
    ${field({ name: "password2", label: "Confirm password", type: "password", required: true, autocomplete: "new-password" })}
    <button class="btn btn-primary btn-block btn-lg" type="submit">Create account & continue</button>
  </form>
</main></body></html>`;
}

export function renderSetup({ csrf, step = 1, flash = null, quote = null }) {
  const cfg = config();
  const presetName = quote?.preset?.name || "";
  return `<div class="setup-steps">
    ${[
      ["1", "Identity", "done", "/admin/settings/business"],
      ["2", "Industry", cfg.setup.preset ? "done" : "current", "/admin/setup#industry"],
      ["3", "Brand", cfg.setup.preset ? "done" : "", "/admin/theme"],
      ["4", "Modules", "done", "/admin/modules"],
      ["5", "Content", "done", "/admin/pages"],
      ["6", "Publish", cfg.setup.completed ? "done" : "current", "/admin/setup#publish"]
    ].map(([n, label, state, href]) => `<a class="setup-step ${state}" href="${href}"><span class="setup-num">${state === "done" ? icon("check", { size: 14 }) : n}</span><span>${esc(label)}</span></a>`).join("")}
  </div>

  <div class="card">
    <div class="card-pad">
      <h2>1. Business identity</h2>
      <p class="muted">${esc(cfg.business.name)} · ${esc(cfg.business.category || "No category yet")} · ${esc(cfg.business.timezone)} · ${esc(cfg.business.currency)}</p>
      <p>${button({ label: "Edit business details", href: "/admin/settings/business", variant: "secondary", size: "sm" })}</p>
    </div>
  </div>

  <div class="card" id="industry">
    <div class="card-pad">
      <h2>2. Choose an industry</h2>
      <p class="muted">A preset writes a starting configuration: modules, navigation, homepage, sample catalog and copy. Everything stays editable afterwards${cfg.setup.preset ? `. Currently applied: <strong>${esc(cfg.setup.preset)}</strong>` : ""}.</p>
      <div class="preset-grid">
        ${quote?.groups?.map((g) => `<div class="preset-group"><p class="preset-group-label">${esc(g.label)}</p>
          ${g.items.map((p) => `<form method="post" action="/admin/setup/preset" class="preset-form">
            ${csrfField(csrf)}
            <input type="hidden" name="preset" value="${esc(p.key)}">
            <button class="preset-card ${cfg.setup.preset === p.key ? "is-applied" : ""}" type="submit">
              <span class="preset-cat">${esc(p.category || "Custom")}</span>
              <strong>${esc(p.name)}</strong>
              <small>${esc(p.tagline || p.description || "")}</small>
              <span class="preset-meta">${p.counts.products} products · ${p.counts.services} services · ${p.modules.length} modules</span>
            </button>
          </form>`).join("")}
        </div>`).join("") || ""}
      </div>
      <p class="fine">Applying a preset keeps existing catalog items and content unless the store is empty. It rewrites the homepage and module selection.</p>
    </div>
  </div>

  <div class="card">
    <div class="card-pad">
      <h2>3. Brand & modules</h2>
      <p class="muted">Set colours, fonts and a logo, then turn capabilities on or off.</p>
      <p>${button({ label: "Appearance", href: "/admin/theme", variant: "secondary", size: "sm" })} ${button({ label: "Modules", href: "/admin/modules", variant: "secondary", size: "sm" })}</p>
    </div>
  </div>

  <div class="card" id="publish">
    <div class="card-pad">
      <h2>4. Publish</h2>
      ${cfg.setup.completed ? `<p>${icon("check", { size: 16 })} Your site is configured. <a href="/" target="_blank">Open the site ↗</a></p>` : `<p class="muted">When the basics look right, preview the site and mark setup complete.</p>`}
      <div class="inline-actions">
        <a class="btn btn-secondary" href="/" target="_blank" rel="noopener">${icon("external", { size: 16 })} Preview site</a>
        <form method="post" action="/admin/setup/complete">${csrfField(csrf)}<button class="btn btn-primary" type="submit">${cfg.setup.completed ? "Setup complete" : "Finish setup"}</button></form>
      </div>
    </div>
  </div>`;
}

/* -------------------------------- settings -------------------------------- */

function hoursGrid(name, value) {
  const hours = value || {};
  return `<div class="hours-grid">
    <div class="hours-head"><span>Day</span><span>Closed</span><span>Opens</span><span>Closes</span></div>
    ${DAYS.map(([key, label]) => {
      const h = hours[key] || { closed: 1, open: "09:00", close: "17:00" };
      return `<div class="hours-line">
        <span>${esc(label)}</span>
        <label class="check-mini"><input type="checkbox" name="hours_${key}_closed" value="1" ${h.closed ? "checked" : ""}><span class="sr-only">Closed ${esc(label)}</span></label>
        <input class="input input-sm" type="time" name="hours_${key}_open" value="${esc(h.open)}">
        <input class="input input-sm" type="time" name="hours_${key}_close" value="${esc(h.close)}">
      </div>`;
    }).join("")}
  </div>`;
}

export function configField(ns, key, def, value) {
  const name = key;
  const fid = `f_${key}`;
  switch (def.type) {
    case "textarea":
      return field({ name, label: def.label, type: "textarea", value: value ?? "", rows: def.rows || 3, help: def.help, id: fid });
    case "bool":
      return field({ name, label: def.label, type: "checkbox", value: !!value, help: def.help, id: fid });
    case "enum":
      return field({ name, label: def.label, type: "select", value: value ?? def.default, help: def.help, id: fid, options: def.values.map((v) => ({ value: v, label: v })) });
    case "money":
      return field({ name, label: def.label, type: "money", value: centsInput(value || 0), help: def.help, id: fid, min: 0 });
    case "int":
      return field({ name, label: def.label, type: "number", value: value ?? def.default, help: def.help, id: fid, min: def.min, max: def.max });
    case "decimal":
      return field({ name, label: def.label, type: "number", value: value ?? def.default, help: def.help, id: fid, min: def.min, max: def.max, step: "0.01" });
    case "color":
      return `<div class="field"><label for="${esc(fid)}">${esc(def.label)}</label>
        <div class="color-input"><input type="color" id="${esc(fid)}" name="${esc(name)}" value="${esc(value || def.default)}">
        <input class="input input-sm" type="text" name="${esc(name)}_hex" value="${esc(value || def.default)}" aria-label="${esc(def.label)} hex value" data-sync-color="${esc(fid)}"></div>
        ${def.help ? `<p class="help">${esc(def.help)}</p>` : ""}</div>`;
    case "media":
      return `<div class="field"><label for="${esc(fid)}">${esc(def.label)}</label>
        <div class="media-row">
          <div class="media-preview-lg">${value ? `<img src="${esc(mediaUrl(value))}" alt="">` : `<span>${icon("image", { size: 22 })}</span>`}</div>
          <div class="media-controls">
            <input class="input input-sm" id="${esc(fid)}" name="${esc(name)}" value="${esc(value || "")}" placeholder="m_… or https://">
            <div class="inline-actions">
              <label class="btn btn-secondary btn-sm">${icon("image", { size: 16 })} Upload<input type="file" hidden data-upload-for="${esc(name)}"></label>
              <button class="btn btn-ghost btn-sm" type="button" data-media-clear="${esc(name)}">Clear</button>
            </div>
          </div>
        </div>
        ${def.help ? `<p class="help">${esc(def.help)}</p>` : ""}</div>`;
    default:
      return field({ name, label: def.label, type: def.type === "email" ? "email" : def.type === "url" ? "url" : "text", value: value ?? "", help: def.help, id: fid, placeholder: def.placeholder || "" });
  }
}

export function renderSettings({ namespace, csrf, flash = null, error = "" }) {
  const def = SCHEMA[namespace];
  const cfg = config();
  const values = cfg[namespace] || {};
  const groups = def.groups || ["Settings"];
  const isHours = namespace === "hours";
  return `<form method="post" action="/admin/settings/${esc(namespace)}" class="settings-form">
    ${csrfField(csrf)}
    ${flashMessage(error ? { type: "error", message: error } : flash)}
    ${groups.map((g) => {
      const entries = Object.entries(def.fields).filter(([, f]) => (f.group || groups[0]) === g);
      if (!entries.length) return "";
      return `<section class="card"><div class="card-pad">
        <h2>${esc(g)}</h2>
        ${g === "Hours" && isHours ? hoursGrid("hours", values.hours) : ""}
        <div class="form-grid ${entries.every(([, f]) => f.type === "bool") ? "form-grid-bools" : ""}">
          ${entries.filter(([, f]) => !(g === "Hours" && isHours && f.type === "hours")).map(([key, f]) => configField(namespace, key, f, values[key])).join("")}
        </div>
      </div></section>`;
    }).join("")}
    <div class="sticky-actions">
      <button class="btn btn-primary" type="submit">Save changes</button>
      <a class="btn btn-ghost" href="/admin">Cancel</a>
    </div>
  </form>`;
}

/* --------------------------------- theme ---------------------------------- */

const THEME_PRESETS = [
  { key: "modern", label: "Modern", colors: ["#1f5c4a", "#d97706", "#fbfaf7"] },
  { key: "bold", label: "Bold", colors: ["#9f1239", "#f59e0b", "#fffbf7"] },
  { key: "minimal", label: "Minimal", colors: ["#111827", "#2563eb", "#fafafa"] },
  { key: "warm", label: "Warm", colors: ["#7c3f21", "#c2410c", "#fdf8f3"] },
  { key: "coastal", label: "Coastal", colors: ["#0e7490", "#f59e0b", "#f7fbfc"] },
  { key: "luxe", label: "Luxe", colors: ["#1e293b", "#b08d57", "#f8f6f2"] }
];

export function renderTheme({ csrf, flash = null, error = "" }) {
  const t = config().theme;
  const b = config().business;
  return `<form method="post" action="/admin/theme" class="settings-form" data-theme-form>
    ${csrfField(csrf)}
    ${flashMessage(error ? { type: "error", message: error } : flash)}
    <section class="card"><div class="card-pad">
      <h2>Theme presets</h2>
      <p class="muted">A starting palette. Picking one fills the colours below; adjust anything afterwards.</p>
      <div class="theme-presets">
        ${THEME_PRESETS.map((p) => `<button type="button" class="theme-swatch ${t.preset === p.key ? "is-active" : ""}" data-theme-preset="${p.key}" data-colors="${p.colors.join(",")}">
          <span class="swatch-dots">${p.colors.map((c) => `<i style="background:${esc(c)}"></i>`).join("")}</span>
          <span>${esc(p.label)}</span>
        </button>`).join("")}
      </div>
      <input type="hidden" name="preset" value="${esc(t.preset)}" data-theme-preset-input>
    </div></section>

    <div class="theme-layout">
      <div>
        <section class="card"><div class="card-pad">
          <h2>Colours</h2>
          <div class="form-grid">
            ${configField("theme", "primary", SCHEMA.theme.fields.primary, t.primary)}
            ${configField("theme", "primaryText", SCHEMA.theme.fields.primaryText, t.primaryText)}
            ${configField("theme", "accent", SCHEMA.theme.fields.accent, t.accent)}
            ${configField("theme", "background", SCHEMA.theme.fields.background, t.background)}
            ${configField("theme", "surface", SCHEMA.theme.fields.surface, t.surface)}
            ${configField("theme", "text", SCHEMA.theme.fields.text, t.text)}
            ${configField("theme", "muted", SCHEMA.theme.fields.muted, t.muted)}
            ${configField("theme", "border", SCHEMA.theme.fields.border, t.border)}
          </div>
        </div></section>
        <section class="card"><div class="card-pad">
          <h2>Type & shape</h2>
          <div class="form-grid">
            ${configField("theme", "headingFont", SCHEMA.theme.fields.headingFont, t.headingFont)}
            ${configField("theme", "bodyFont", SCHEMA.theme.fields.bodyFont, t.bodyFont)}
            ${configField("theme", "radius", SCHEMA.theme.fields.radius, t.radius)}
          </div>
        </div></section>
        <section class="card"><div class="card-pad">
          <h2>Imagery</h2>
          <div class="form-grid">
            ${configField("theme", "logo", SCHEMA.theme.fields.logo, t.logo)}
            ${configField("theme", "favicon", SCHEMA.theme.fields.favicon, t.favicon)}
            ${configField("theme", "heroImage", SCHEMA.theme.fields.heroImage, t.heroImage)}
            ${configField("theme", "ogImage", SCHEMA.theme.fields.ogImage, t.ogImage)}
          </div>
        </div></section>
      </div>
      <aside class="theme-preview-wrap">
        <p class="eyebrow">Live preview</p>
        <div class="theme-preview" data-theme-preview style="--p:${esc(t.primary)};--pt:${esc(t.primaryText)};--a:${esc(t.accent)};--bg:${esc(t.background)};--sf:${esc(t.surface)};--tx:${esc(t.text)};--mu:${esc(t.muted)};--bd:${esc(t.border)}">
          <div class="tp-bar"><span class="tp-logo">${t.logo ? `<img src="${esc(mediaUrl(t.logo))}" alt="">` : esc((b.name || "S").slice(0, 1))}</span><span>${esc(b.name)}</span><i></i><i></i><i></i></div>
          <div class="tp-body">
            <p class="tp-eyebrow">${esc(b.category || "Your business")}</p>
            <p class="tp-title">A headline that looks like yours.</p>
            <p class="tp-text">${esc(b.tagline || "Your tagline appears here, in the same type used across the site.")}</p>
            <span class="tp-btn">Primary action</span> <span class="tp-btn ghost">Secondary</span>
            <div class="tp-cards"><div class="tp-card"><span class="tp-img"></span><span class="tp-line"></span><span class="tp-line short"></span></div><div class="tp-card"><span class="tp-img"></span><span class="tp-line"></span><span class="tp-line short"></span></div></div>
          </div>
        </div>
        <p class="fine">The preview uses live values as you type. Save to publish.</p>
      </aside>
    </div>
    <div class="sticky-actions">
      <button class="btn btn-primary" type="submit">Publish appearance</button>
      <a class="btn btn-ghost" href="/" target="_blank">Open site ↗</a>
    </div>
  </form>`;
}

/* -------------------------------- dashboard ------------------------------- */

export function renderDashboard({ csrf, quote = null, stats, recentOrders = [], recentBookings = [], recentInquiries = [], lowStock = [], topProducts = [] }) {
  const cfg = config();
  const hasCommerce = isEnabled("commerce");
  const hasBookings = isEnabled("bookings");
  const hasInquiries = isEnabled("inquiries");
  return `<div class="stat-grid">
    ${hasCommerce ? statTile({ label: "Revenue, 30 days", value: moneyFmt(stats.orders.revenue30), sub: `${stats.orders.today} order${stats.orders.today === 1 ? "" : "s"} today`, href: "/admin/orders", tone: "ok" }) : ""}
    ${hasCommerce ? statTile({ label: "Open orders", value: String(stats.orders.open), sub: `${stats.orders.pending} awaiting payment`, href: "/admin/orders?status=confirmed" }) : ""}
    ${hasBookings ? statTile({ label: "Bookings today", value: String(stats.bookings.today), sub: `${stats.bookings.pending} pending`, href: "/admin/bookings?view=today" }) : ""}
    ${hasInquiries ? statTile({ label: "New inquiries", value: String(stats.inquiries.unread || 0), sub: "Waiting for a reply", href: "/admin/inquiries" }) : ""}
    ${isEnabled("catalog") ? statTile({ label: "Products", value: String(stats.products.active || 0), sub: `${stats.products.featured || 0} featured`, href: "/admin/products" }) : ""}
    ${isEnabled("services") ? statTile({ label: "Services", value: String(stats.services.active || 0), sub: "Visible on the site", href: "/admin/services" }) : ""}
  </div>

  ${!cfg.setup.completed ? `<div class="callout callout-warn"><div><strong>Finish setting up.</strong> Pick an industry preset, add your logo and publish the site.</div>${button({ label: "Open setup", href: "/admin/setup", variant: "primary", size: "sm" })}</div>` : ""}

  ${quote ? `<div class="card"><div class="card-pad quote-card">
    <p class="eyebrow">Today</p><p class="quote-line">“${esc(quote.text)}”</p><p class="muted">— ${esc(quote.author)}</p>
  </div></div>` : ""}

  <div class="dash-grid">
    ${hasCommerce ? `<section class="card"><div class="card-head"><h2>Recent orders</h2><a href="/admin/orders">All orders</a></div>
      ${recentOrders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th class="ta-right">Total</th></tr></thead><tbody>
        ${recentOrders.map((o) => `<tr><td><a href="/admin/orders/${esc(o.number)}">${esc(o.number)}</a><br><small class="muted">${esc(fmtDate(o.created_at, cfg.business.timezone))}</small></td><td>${esc(o.name)}</td><td>${statusBadge(o.status)}</td><td class="ta-right">${esc(moneyFmt(o.total_cents))}</td></tr>`).join("")}
      </tbody></table></div>` : emptyState("No orders yet", hasCommerce ? "Orders will appear here." : "")}
    </section>` : ""}

    <div class="dash-col">
      ${hasBookings ? `<section class="card"><div class="card-head"><h2>Next bookings</h2><a href="/admin/bookings">All</a></div>
        ${recentBookings.length ? recentBookings.map((bk) => `<div class="list-row"><div><strong>${esc(bk.name)}</strong><small>${esc(bk.service_name)}</small></div><div class="ta-right"><span>${esc(fmtDate(bk.starts_at, cfg.business.timezone))}</span><small>${esc(fmtTimeOnly(bk.starts_at, cfg.business.timezone))}</small></div></div>`).join("") : `<p class="muted card-pad">No upcoming bookings.</p>`}
      </section>` : ""}
      ${hasInquiries ? `<section class="card"><div class="card-head"><h2>Inquiries</h2><a href="/admin/inquiries">Inbox</a></div>
        ${recentInquiries.length ? recentInquiries.map((i) => `<div class="list-row"><div><strong>${esc(i.name)}</strong><small>${esc(i.subject)}</small></div><div class="ta-right"><span>${esc(fmtDate(i.created_at, cfg.business.timezone))}</span>${badge(i.status, i.status === "new" ? "warn" : "neutral")}</div></div>`).join("") : `<p class="muted card-pad">Nothing new.</p>`}
      </section>` : ""}
      ${isEnabled("inventory") && lowStock.length ? `<section class="card"><div class="card-head"><h2>Low stock</h2><a href="/admin/products">Products</a></div>
        ${lowStock.map((p) => `<div class="list-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.sku)}</small></div><span class="${p.stock === 0 ? "text-danger" : "text-warn"}">${p.stock} left</span></div>`).join("")}
      </section>` : ""}
    </div>
  </div>

  ${isEnabled("catalog") && topProducts.length ? `<section class="card"><div class="card-head"><h2>Best sellers</h2><small class="muted">Paid orders</small></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th class="ta-right">Units</th><th class="ta-right">Revenue</th></tr></thead><tbody>
    ${topProducts.map((p) => `<tr><td>${esc(p.name)}</td><td class="ta-right">${p.qty}</td><td class="ta-right">${esc(moneyFmt(p.cents))}</td></tr>`).join("")}</tbody></table></div>
  </section>` : ""}`;
}

function fmtTimeOnly(value, tz) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(value)); } catch { return ""; }
}

/* ------------------------------ small helpers ----------------------------- */

export const pageActions = (...buttons) => buttons.filter(Boolean).join("");

export function confirmButton(label, { action, csrf, confirm = "Are you sure?", variant = "danger", name = "", value = "", extra = "" }) {
  return `<form method="post" action="${esc(action)}" class="inline-form" data-confirm="${esc(confirm)}">
    ${csrfField(csrf)}${extra}
    <button class="btn btn-${esc(variant)} btn-sm" type="submit" ${name ? `name="${esc(name)}" value="${esc(value)}"` : ""}>${esc(label)}</button>
  </form>`;
}

export { statusBadge, emptyState, badge, icon, moneyFmt };
