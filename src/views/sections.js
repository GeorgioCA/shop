// Section renderer. One function per section type; the admin editor uses the
// same registry, so a new field can never render in one place and not the other.

import { db } from "../core/db.js";
import { config } from "../core/config.js";
import { esc, money, truncate } from "../core/util.js";
import { mediaUrl, mediaExists } from "../core/media.js";
import { icon, button, priceBlock, priceOf, ratingStars } from "./components.js";
import { listProducts } from "../modules/catalog.js";
import { listServices } from "../modules/services.js";
import { listFaqs, listTestimonials } from "../modules/content.js";

const moneyFmt = (cents) => money(cents, config().business.currency, config().business.locale);

export const paragraphs = (text) =>
  String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

export const pairLines = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^([^|]+)\|(.*)$/.exec(line);
      return m ? { title: m[1].trim(), text: m[2].trim() } : { title: line, text: "" };
    });

export function renderSections(sections = []) {
  return sections.map((s) => renderSection(s)).filter(Boolean).join("");
}

export function renderSection(s) {
  const fn = RENDERERS[s.type];
  if (!fn) return "";
  return fn(s);
}

/* ---------------------------------- cards --------------------------------- */

export function productCard(p) {
  const cfg = config();
  const members = p.variant_group
    ? db.prepare("SELECT * FROM products WHERE variant_group = ? AND active = 1 ORDER BY price_cents, name").all(p.variant_group)
    : [p];
  const hasVariants = members.length > 1;
  const images = [p.image, ...(p.gallery || [])].filter((i) => mediaExists(i));
  const cheapest = Math.min(...members.map((m) => priceOf(m)));
  const soldOut = p.sold_out || (p.track_stock && p.stock <= 0);
  const art = images.length
    ? `<img class="card-img" src="${esc(mediaUrl(images[0]))}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="card-art" aria-hidden="true"><span>${esc((p.name || "P").slice(0, 1))}</span></div>`;

  const opts = hasVariants
    ? `<label class="variant-label" for="v-${esc(p.id)}">Options</label>
       <select class="input input-sm" id="v-${esc(p.id)}" data-variant-select>
         ${members.map((m) => `<option value="${esc(m.id)}" data-price="${m.price_now}" data-soldout="${m.sold_out ? 1 : 0}">${esc(Object.values(m.variant_options || {}).join(" / ") || m.name)} — ${esc(moneyFmt(m.price_now))}</option>`).join("")}
       </select>`
    : "";

  const action = isEnabledCommerce()
    ? `<div class="card-buy">
        ${opts}
        <button class="btn btn-primary btn-sm" type="button"
          data-add-to-cart
          data-id="${esc(p.id)}"
          data-name="${esc(p.name)}"
          data-price="${cheapest}"
          data-image="${esc(images[0] || "")}"
          data-variant-select="${hasVariants ? `v-${esc(p.id)}` : ""}"
          ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : hasVariants ? "Choose & add" : "Add"}</button>
      </div>`
    : `<a class="btn btn-secondary btn-sm" href="/product/${esc(p.slug)}">Details</a>`;

  return `<article class="card product-card" id="product-${esc(p.id)}">
    <a class="card-media" href="/product/${esc(p.slug)}" aria-hidden="true" tabindex="-1">${art}</a>
    <div class="card-body">
      ${p.featured ? `<span class="card-flag">Featured</span>` : ""}
      <h3 class="card-title"><a href="/product/${esc(p.slug)}">${esc(p.name)}</a></h3>
      ${p.short_desc ? `<p class="card-text">${esc(truncate(p.short_desc, 120))}</p>` : ""}
      ${hasVariants ? `<p class="card-from">From ${esc(moneyFmt(cheapest))}</p>` : priceBlock(p.price_cents, p.sale_price_cents)}
      ${action}
    </div>
  </article>`;
}

const isEnabledCommerce = () => {
  // Local import avoids a cycle: orders imports catalog, catalog does not import views.
  try {
    return db.prepare("SELECT enabled FROM modules WHERE key = 'commerce'").get()?.enabled === 1;
  } catch {
    return false;
  }
};

export function serviceCard(s) {
  const price =
    s.price_type === "quote"
      ? "Quote"
      : s.price_type === "from"
        ? `From ${moneyFmt(s.price_cents)}`
        : moneyFmt(s.price_cents);
  return `<article class="card service-card">
    ${mediaExists(s.image) ? `<div class="card-media"><img class="card-img" src="${esc(mediaUrl(s.image))}" alt="${esc(s.name)}" loading="lazy"></div>` : ""}
    <div class="card-body">
      <h3 class="card-title"><a href="/services/${esc(s.slug)}">${esc(s.name)}</a></h3>
      ${s.short_desc ? `<p class="card-text">${esc(truncate(s.short_desc, 130))}</p>` : ""}
      <p class="card-meta">${icon("clock", { size: 14 })} ${esc(s.duration_min)} min ${config().catalog.showPrices ? `<span class="dot">·</span> <strong>${esc(price)}</strong>` : ""}</p>
      <div class="card-actions">
        <a class="btn btn-primary btn-sm" href="/book?service=${esc(s.id)}">Book</a>
        <a class="btn btn-ghost btn-sm" href="/services/${esc(s.slug)}">Details</a>
      </div>
    </div>
  </article>`;
}

/* -------------------------------- renderers -------------------------------- */

const RENDERERS = {
  hero(s) {
    const cfg = config();
    const img = [s.image, cfg.theme.heroImage].find((i) => mediaExists(i));
    const art = img
      ? `<div class="hero-art"><img src="${esc(mediaUrl(img))}" alt="" loading="eager"></div>`
      : `<div class="hero-art hero-art-type" aria-hidden="true"><span class="hero-monogram">${esc((cfg.business.name || "S").slice(0, 1))}</span><span class="hero-shape"></span><span class="hero-ring"></span></div>`;
    return `<section class="hero ${s.tall ? "hero-tall" : ""} align-${esc(s.align || "left")}">
      <div class="wrap hero-inner">
        <div class="hero-copy">
          ${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ""}
          ${s.title ? `<h1>${esc(s.title)}</h1>` : ""}
          ${s.text ? `<p class="lede">${esc(s.text)}</p>` : ""}
          ${s.ctaLabel || s.cta2Label ? `<div class="hero-actions">
            ${s.ctaLabel ? button({ label: s.ctaLabel, href: s.ctaUrl || "#", variant: "primary" }) : ""}
            ${s.cta2Label ? button({ label: s.cta2Label, href: s.cta2Url || "#", variant: "secondary" }) : ""}
          </div>` : ""}
        </div>
        ${art}
      </div>
    </section>`;
  },

  image_text(s) {
    return `<section class="section">
      <div class="wrap split ${s.side === "left" ? "split-reverse" : ""}">
        <div class="split-copy">
          ${s.eyebrow ? `<p class="eyebrow">${esc(s.eyebrow)}</p>` : ""}
          ${s.title ? `<h2>${esc(s.title)}</h2>` : ""}
          <div class="prose">${paragraphs(s.text)}</div>
          ${s.ctaLabel ? `<p style="margin-top:1.25rem">${button({ label: s.ctaLabel, href: s.ctaUrl || "#", variant: "secondary" })}</p>` : ""}
        </div>
        <div class="split-media">
          ${mediaExists(s.image) ? `<img src="${esc(mediaUrl(s.image))}" alt="" loading="lazy">` : `<div class="media-placeholder" aria-hidden="true">${icon("image", { size: 34 })}</div>`}
        </div>
      </div>
    </section>`;
  },

  rich_text(s) {
    return `<section class="section"><div class="wrap ${s.narrow ? "narrow" : ""} align-${esc(s.align || "left")}">
      ${s.title ? `<h2>${esc(s.title)}</h2>` : ""}
      <div class="prose">${paragraphs(s.text)}</div>
    </div></section>`;
  },

  product_grid(s) {
    const products = listProducts({
      activeOnly: true,
      categoryId: s.categoryId || "",
      featured: !!s.featuredOnly,
      limit: Number(s.limit) || 6
    });
    if (!products.length) return "";
    return `<section class="section">
      <div class="wrap">
        ${s.title || s.text ? `<div class="section-head"><div>${s.title ? `<h2>${esc(s.title)}</h2>` : ""}${s.text ? `<p class="section-lede">${esc(s.text)}</p>` : ""}</div>
          ${s.ctaLabel ? button({ label: s.ctaLabel, href: s.ctaUrl || "/shop", variant: "ghost" }) : ""}</div>` : ""}
        <div class="grid grid-${esc(s.columns || "3")}">${products.map(productCard).join("")}</div>
      </div>
    </section>`;
  },

  menu_list(s) {
    const products = listProducts({ activeOnly: true, categoryId: s.categoryId || "" });
    if (!products.length) return "";
    const byCat = new Map();
    for (const p of products) {
      const cat = p.category_id ? db.prepare("SELECT name FROM categories WHERE id = ?").get(p.category_id)?.name : "Menu";
      const key = cat || "Menu";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(p);
    }
    const money = (c) => moneyFmt(c);
    return `<section class="section section-menu">
      <div class="wrap">
        ${s.title || s.text ? `<div class="section-head"><div>${s.title ? `<h2>${esc(s.title)}</h2>` : ""}${s.text ? `<p class="section-lede">${esc(s.text)}</p>` : ""}</div></div>` : ""}
        <div class="menu-grid">
          ${[...byCat.entries()].map(([cat, items]) => `<div class="menu-group">
            <h3 class="menu-cat">${esc(cat)}</h3>
            ${items.map((p) => `<div class="menu-row">
              <div class="menu-line"><span class="menu-name">${esc(p.name)}</span><span class="menu-dots" aria-hidden="true"></span><span class="menu-price">${esc(money(p.price_now))}</span></div>
              ${s.showDescriptions && p.short_desc ? `<p class="menu-desc">${esc(p.short_desc)}</p>` : ""}
            </div>`).join("")}
          </div>`).join("")}
        </div>
        ${isEnabledCommerce() ? `<p class="menu-note">${button({ label: "Order online", href: "/shop", variant: "primary" })}</p>` : ""}
      </div>
    </section>`;
  },

  service_grid(s) {
    const services = listServices({ activeOnly: true, limit: Number(s.limit) || 6 });
    if (!services.length) return "";
    return `<section class="section">
      <div class="wrap">
        ${s.title || s.text ? `<div class="section-head"><div>${s.title ? `<h2>${esc(s.title)}</h2>` : ""}${s.text ? `<p class="section-lede">${esc(s.text)}</p>` : ""}</div>
          ${s.ctaLabel ? button({ label: s.ctaLabel, href: s.ctaUrl || "/book", variant: "ghost" }) : ""}</div>` : ""}
        <div class="grid grid-${esc(s.columns || "3")}">${services.map(serviceCard).join("")}</div>
      </div>
    </section>`;
  },

  feature_list(s) {
    const items = pairLines(s.items);
    if (!items.length) return "";
    return `<section class="section section-tint">
      <div class="wrap">
        ${s.title ? `<div class="section-head"><div><h2>${esc(s.title)}</h2>${s.text ? `<p class="section-lede">${esc(s.text)}</p>` : ""}</div></div>` : ""}
        <div class="features">${items.map((it, i) => `<div class="feature">
          <span class="feature-num">${String(i + 1).padStart(2, "0")}</span>
          <h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ""}
        </div>`).join("")}</div>
      </div>
    </section>`;
  },

  stats(s) {
    const items = pairLines(s.items);
    if (!items.length) return "";
    return `<section class="section section-stats"><div class="wrap">
      ${s.title ? `<h2 class="stats-title">${esc(s.title)}</h2>` : ""}
      <div class="stats">${items.map((it) => `<div class="stat-block"><p class="stat-big">${esc(it.title)}</p><p class="stat-cap">${esc(it.text)}</p></div>`).join("")}</div>
    </div></section>`;
  },

  gallery(s) {
    const images = String(s.images || "").split(/\r?\n/).map((x) => x.trim()).filter((x) => mediaExists(x));
    return `<section class="section">
      <div class="wrap">
        ${s.title || s.text ? `<div class="section-head"><div>${s.title ? `<h2>${esc(s.title)}</h2>` : ""}${s.text ? `<p class="section-lede">${esc(s.text)}</p>` : ""}</div></div>` : ""}
        ${images.length
          ? `<div class="gallery grid-${esc(s.columns || "3")}">${images.map((src) => `<figure class="gallery-item"><img src="${esc(mediaUrl(src) || src)}" alt="" loading="lazy"></figure>`).join("")}</div>`
          : `<div class="gallery-empty">${Array.from({ length: 3 }, () => `<div class="gallery-placeholder" aria-hidden="true">${icon("image", { size: 28 })}</div>`).join("")}</div>`}
      </div>
    </section>`;
  },

  testimonials(s) {
    const items = listTestimonials({ activeOnly: true }).slice(0, Number(s.limit) || 3);
    if (!items.length) return "";
    return `<section class="section section-tint">
      <div class="wrap">
        <div class="section-head"><div><h2>${esc(s.title || "What people say")}</h2>${s.text ? `<p class="section-lede">${esc(s.text)}</p>` : ""}</div></div>
        <div class="quotes">${items.map((t) => `<figure class="quote">
          ${ratingStars(t.rating, { size: 15 })}
          <blockquote>“${esc(t.quote)}”</blockquote>
          <figcaption><strong>${esc(t.author)}</strong>${t.role ? `<span>${esc(t.role)}</span>` : ""}</figcaption>
        </figure>`).join("")}</div>
      </div>
    </section>`;
  },

  faq(s) {
    const items = listFaqs({ activeOnly: true }).slice(0, Number(s.limit) || 6);
    if (!items.length) return "";
    return `<section class="section">
      <div class="wrap narrow">
        <h2>${esc(s.title || "Common questions")}</h2>
        ${s.text ? `<p class="section-lede">${esc(s.text)}</p>` : ""}
        <div class="faq">${items.map((f) => `<details class="faq-item">
          <summary>${esc(f.question)}${icon("chevron", { size: 18, cls: "faq-chev" })}</summary>
          <div class="faq-answer">${paragraphs(f.answer)}</div>
        </details>`).join("")}</div>
      </div>
    </section>`;
  },

  cta(s) {
    return `<section class="section"><div class="wrap">
      <div class="cta-block cta-${esc(s.tone || "primary")}">
        <div>${s.title ? `<h2>${esc(s.title)}</h2>` : ""}${s.text ? `<p>${esc(s.text)}</p>` : ""}</div>
        ${s.ctaLabel ? button({ label: s.ctaLabel, href: s.ctaUrl || "#", variant: s.tone === "primary" ? "light" : "primary" }) : ""}
      </div>
    </div></section>`;
  },

  booking_cta(s) {
    return `<section class="section section-tint"><div class="wrap">
      <div class="booking-cta">
        <div class="booking-cta-icon">${icon("calendar", { size: 26 })}</div>
        <div><h2>${esc(s.title || "Book an appointment")}</h2>${s.text ? `<p>${esc(s.text)}</p>` : ""}</div>
        ${s.ctaLabel ? button({ label: s.ctaLabel, href: s.ctaUrl || "/book", variant: "primary" }) : ""}
      </div>
    </div></section>`;
  },

  contact_hours(s) {
    const cfg = config();
    const b = cfg.business;
    const address = [b.address1, b.address2, [b.city, b.region, b.postal].filter(Boolean).join(", ")].filter(Boolean).join(", ");
    return `<section class="section"><div class="wrap split">
      <div class="split-copy">
        <h2>${esc(s.title || "Visit us")}</h2>
        ${s.text ? `<div class="prose">${paragraphs(s.text)}</div>` : ""}
        <ul class="contact-list">
          ${address ? `<li>${icon("pin", { size: 18 })}<span>${esc(address)}</span></li>` : ""}
          ${b.phone ? `<li>${icon("phone", { size: 18 })}<a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a></li>` : ""}
          ${b.email ? `<li>${icon("mail", { size: 18 })}<a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>` : ""}
          ${s.showMap && b.mapUrl ? `<li>${icon("external", { size: 18 })}<a href="${esc(b.mapUrl)}" rel="noopener" target="_blank">Open in maps</a></li>` : ""}
        </ul>
      </div>
      ${s.showHours ? `<div class="split-media hours-panel">
        <h3>Hours</h3>
        ${Object.entries(cfg.hours.hours).map(([key, h]) => `<p class="hours-row"><span>${esc(key.charAt(0).toUpperCase() + key.slice(1))}</span><span>${h.closed ? "Closed" : `${esc(h.open)}–${esc(h.close)}`}</span></p>`).join("")}
        ${cfg.hours.note ? `<p class="hours-note">${esc(cfg.hours.note)}</p>` : ""}
      </div>` : ""}
    </div></section>`;
  },

  banner(s) {
    return `<section class="banner-section"><div class="wrap">
      <div class="banner" ${mediaExists(s.image) ? `style="background-image:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.2)),url('${esc(mediaUrl(s.image))}')"` : ""}>
        <p>${esc(s.text)}</p>
        ${s.ctaLabel ? button({ label: s.ctaLabel, href: s.ctaUrl || "#", variant: "light" }) : ""}
      </div>
    </div></section>`;
  }
};

export { RENDERERS };
