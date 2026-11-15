// Shared HTML components. Everything that comes from a user or the database is
// escaped here; callers pass plain values, never markup.

import { esc, money, truncate, initials } from "../core/util.js";
import { config, currencySymbol } from "../core/config.js";
import { mediaUrl } from "../core/media.js";

export const moneyFmt = (cents) => money(cents, config().business.currency, config().business.locale);

/* --------------------------------- icons --------------------------------- */

const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  cart: '<path d="M6 6h15l-2 9H8L6 6Z"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M6 6 5 3H2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="M13 5l4 4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  star: '<path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 21l1.2-6.5L2.5 9.9 9.1 9 12 3Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M6 3h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 4 5a2 2 0 0 1 2-2Z"/>',
  pin: '<path d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2A3.2 3.2 0 0 1 16 11M18 20c0-2.5-1-4.5-2.5-5.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="M3 8l9-5 9 5v9l-9 5-9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M10 10v10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7v.5"/><circle cx="12" cy="17.2" r=".8"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
};

export function icon(name, { size = 20, cls = "" } = {}) {
  const body = ICONS[name] || ICONS.help;
  return `<svg class="icon ${esc(cls)}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* -------------------------------- elements -------------------------------- */

export function button({ label, href, type = "button", variant = "primary", size = "", icon: iconName = "", attrs = "", name = "", value = "" }) {
  const cls = `btn btn-${esc(variant)}${size ? ` btn-${esc(size)}` : ""}`;
  const inner = `${iconName ? icon(iconName, { size: 18 }) : ""}<span>${esc(label)}</span>`;
  if (href) return `<a class="${cls}" href="${esc(href)}" ${attrs}>${inner}</a>`;
  return `<button class="${cls}" type="${esc(type)}" ${name ? `name="${esc(name)}" value="${esc(value)}"` : ""} ${attrs}>${inner}</button>`;
}

export function field({
  label, name, value = "", type = "text", required = false, help = "", error = "", placeholder = "",
  options = [], rows = 4, min, max, step, autocomplete = "", id: fieldId, attrs = "", disabled = false, group = ""
}) {
  const fid = fieldId || `f_${name}`;
  const common = `id="${esc(fid)}" name="${esc(name)}" ${required ? "required" : ""} ${disabled ? "disabled" : ""} ${attrs}`;
  let input = "";
  if (type === "textarea") {
    input = `<textarea class="input" ${common} rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else if (type === "select") {
    input = `<select class="input" ${common}>${options
      .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${esc(o.label)}</option>`)
      .join("")}</select>`;
  } else if (type === "checkbox") {
    return `<div class="field field-check ${error ? "has-error" : ""}">
      <label class="check"><input type="checkbox" ${common} value="1" ${value ? "checked" : ""}><span>${esc(label)}</span></label>
      ${help ? `<p class="help">${esc(help)}</p>` : ""}${error ? `<p class="error">${esc(error)}</p>` : ""}</div>`;
  } else if (type === "radio-cards") {
    input = `<div class="radio-cards">${options
      .map(
        (o) => `<label class="radio-card"><input type="radio" ${common} value="${esc(o.value)}" ${String(o.value) === String(value) ? "checked" : ""}>
        <span class="radio-card-body">${o.icon ? icon(o.icon, { size: 22 }) : ""}<strong>${esc(o.label)}</strong>${o.help ? `<small>${esc(o.help)}</small>` : ""}</span></label>`
      )
      .join("")}</div>`;
  } else if (type === "money") {
    input = `<div class="money-input"><span>${esc(currencySymbol())}</span><input class="input" ${common} type="number" step="0.01" min="${min ?? 0}" value="${esc(value)}" placeholder="${esc(placeholder || "0.00")}" inputmode="decimal"></div>`;
  } else {
    input = `<input class="input" ${common} type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"
      ${min !== undefined ? `min="${esc(min)}"` : ""} ${max !== undefined ? `max="${esc(max)}"` : ""}
      ${step !== undefined ? `step="${esc(step)}"` : ""} ${autocomplete ? `autocomplete="${esc(autocomplete)}"` : ""}>`;
  }
  return `<div class="field ${error ? "has-error" : ""}" ${group ? `data-group="${esc(group)}"` : ""}>
    <label for="${esc(fid)}">${esc(label)}${required ? ' <span class="req" aria-hidden="true">*</span>' : ""}</label>
    ${input}${help ? `<p class="help">${esc(help)}</p>` : ""}${error ? `<p class="error">${esc(error)}</p>` : ""}</div>`;
}

export function selectField(name, label, value, options, { help = "", required = false } = {}) {
  return field({ name, label, value, type: "select", options, help, required });
}

export function flashMessage(flash) {
  if (!flash) return "";
  return `<div class="flash flash-${flash.type === "error" ? "error" : "ok"}" role="${flash.type === "error" ? "alert" : "status"}">
    ${icon(flash.type === "error" ? "help" : "check", { size: 18 })}<span>${esc(flash.message)}</span></div>`;
}

export function badge(text, tone = "neutral") {
  return `<span class="badge badge-${esc(tone)}">${esc(text)}</span>`;
}

const STATUS_TONES = {
  pending: "warn", unpaid: "warn", new: "warn", draft: "neutral", awaiting_payment: "warn",
  confirmed: "info", paid: "ok", ready: "info", completed: "ok", archived: "neutral",
  cancelled: "danger", refunded: "danger", no_show: "danger", approved: "ok", rejected: "danger", read: "neutral"
};

export const statusBadge = (status) =>
  badge(String(status || "").replace(/_/g, " "), STATUS_TONES[status] || "neutral");

export function ratingStars(rating, { size = 14 } = {}) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  return `<span class="stars" aria-label="${n} out of 5">${Array.from({ length: 5 }, (_, i) =>
    `<span class="${i < Math.round(n) ? "on" : "off"}">${icon("star", { size })}</span>`
  ).join("")}</span>`;
}

export function emptyState(title, text = "", action = "") {
  return `<div class="empty"><div class="empty-icon">${icon("box", { size: 30 })}</div>
    <h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${action}</div>`;
}

export function pagination(page, basePath, query = {}) {
  if (!page || page.pages <= 1) return "";
  const link = (p) => {
    const params = new URLSearchParams({ ...query, page: String(p) });
    return `${basePath}?${params.toString()}`;
  };
  const nums = [];
  const from = Math.max(1, page.page - 2);
  const to = Math.min(page.pages, page.page + 2);
  for (let i = from; i <= to; i++) nums.push(i);
  return `<nav class="pager" aria-label="Pagination">
    ${page.page > 1 ? `<a class="pager-link" href="${esc(link(page.page - 1))}" rel="prev">Previous</a>` : ""}
    ${from > 1 ? `<a class="pager-link" href="${esc(link(1))}">1</a>${from > 2 ? `<span class="pager-gap">…</span>` : ""}` : ""}
    ${nums.map((n) => `<a class="pager-link ${n === page.page ? "is-current" : ""}" href="${esc(link(n))}" ${n === page.page ? 'aria-current="page"' : ""}>${n}</a>`).join("")}
    ${to < page.pages ? `${to < page.pages - 1 ? `<span class="pager-gap">…</span>` : ""}<a class="pager-link" href="${esc(link(page.pages))}">${page.pages}</a>` : ""}
    ${page.page < page.pages ? `<a class="pager-link" href="${esc(link(page.page + 1))}" rel="next">Next</a>` : ""}
  </nav>`;
}

export function img(src, alt, { cls = "", loading = "lazy", sizes = "", attrs = "" } = {}) {
  if (!src) return "";
  return `<img class="${esc(cls)}" src="${esc(mediaUrl(src) || src)}" alt="${esc(alt)}" loading="${esc(loading)}" decoding="async" ${sizes ? `sizes="${esc(sizes)}"` : ""} ${attrs}>`;
}

export function avatar(name, { size = 36 } = {}) {
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function priceBlock(priceCents, salePriceCents, { large = false } = {}) {
  if (!config().catalog.showPrices) return "";
  const sale = Number(salePriceCents);
  const onSale = Number.isInteger(sale) && sale > 0 && sale < priceCents;
  return `<div class="price ${large ? "price-lg" : ""}">
    ${onSale ? `<span class="price-now">${esc(moneyFmt(sale))}</span><span class="price-was">${esc(moneyFmt(priceCents))}</span>` : `<span class="price-now">${esc(moneyFmt(priceCents))}</span>`}
  </div>`;
}

export const priceOf = (p) => {
  const sale = Number(p?.sale_price_cents);
  return Number.isInteger(sale) && sale > 0 && sale < p.price_cents ? sale : p.price_cents;
};

export function sectionHeading({ eyebrow = "", title, text = "", align = "left" }) {
  return `<div class="section-head align-${esc(align)}">
    ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
    <h2>${esc(title)}</h2>
    ${text ? `<p class="section-lede">${esc(text)}</p>` : ""}
  </div>`;
}

export const fieldsValue = (obj, key, fallback = "") => (obj && obj[key] !== undefined ? obj[key] : fallback);

export function mediaPicker({ name, value = "", label = "Image" }) {
  return `<div class="field media-field">
    <label for="f_${esc(name)}">${esc(label)}</label>
    <div class="media-input">
      <input class="input" id="f_${esc(name)}" name="${esc(name)}" value="${esc(value)}" placeholder="Image URL or filename" data-media-input>
      <button type="button" class="btn btn-secondary btn-sm" data-media-open data-target="${esc(name)}">${icon("image", { size: 16 })} Choose</button>
    </div>
    <div class="media-preview" data-media-preview="${esc(name)}">${value ? img(value, "", { cls: "thumb" }) : ""}</div>
    <p class="help">Uploads live in the media library. Paste a filename (e.g. <code>m_abc.webp</code>) or a full URL.</p>
  </div>`;
}

export function statTile({ label, value, sub = "", href = "", tone = "" }) {
  const inner = `<p class="stat-label">${esc(label)}</p><p class="stat-value">${esc(value)}</p>${sub ? `<p class="stat-sub">${esc(sub)}</p>` : ""}`;
  return href ? `<a class="stat ${tone ? `stat-${esc(tone)}` : ""}" href="${esc(href)}">${inner}</a>` : `<div class="stat ${tone ? `stat-${esc(tone)}` : ""}">${inner}</div>`;
}

export function table({ columns, rows, empty = "Nothing here yet." }) {
  if (!rows.length) return emptyState(empty);
  return `<div class="table-wrap"><table class="table">
    <thead><tr>${columns.map((c) => `<th ${c.align ? `class="ta-${esc(c.align)}"` : ""}>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map((r) => `<tr>${columns.map((c) => `<td ${c.align ? `class="ta-${esc(c.align)}"` : ""}>${c.value(r)}</td>`).join("")}</tr>`)
      .join("")}</tbody>
  </table></div>`;
}

export { truncate };
