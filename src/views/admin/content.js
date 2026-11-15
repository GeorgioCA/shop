// Admin: pages, the section editor, navigation, FAQs and testimonials.

import { db } from "../../core/db.js";
import { config } from "../../core/config.js";
import { esc, truncate, fmtDate } from "../../core/util.js";
import { icon, field, button, emptyState, statusBadge, img } from "../components.js";
import { mediaUrl } from "../../core/media.js";
import { csrfField } from "../layout.js";
import { SECTION_TYPES, SECTION_CHOICES } from "../../content/sections.js";
import { listCategories } from "../../modules/catalog.js";
import { pageUrl } from "../../modules/content.js";

/* --------------------------------- pages ---------------------------------- */

export function renderPageList({ pages, csrf, flash = null }) {
  return `${flash || ""}
  <div class="toolbar"><p class="muted">${pages.length} page${pages.length === 1 ? "" : "s"}</p>${button({ label: "New page", href: "/admin/pages/new", variant: "primary", size: "sm", icon: "plus" })}</div>
  ${pages.length ? `<div class="table-wrap card"><table class="table table-hover">
    <thead><tr><th>Page</th><th>URL</th><th>Sections</th><th>Status</th><th>Updated</th><th></th></tr></thead>
    <tbody>${pages.map((p) => `<tr>
      <td><a class="strong" href="/admin/pages/${esc(p.id)}">${esc(p.title)}</a>${p.is_home ? ` ${statusBadge("home")}` : ""}</td>
      <td><code>${esc(pageUrl(p))}</code></td>
      <td>${p.sections.length}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="muted">${esc(fmtDate(p.updated_at, config().business.timezone))}</td>
      <td class="ta-right"><a class="btn btn-ghost btn-sm" href="${esc(pageUrl(p))}" target="_blank">View</a></td>
    </tr>`).join("")}</tbody></table></div>`
    : emptyState("No pages yet", "Create a page and add sections to it.", button({ label: "New page", href: "/admin/pages/new", variant: "primary" }))}`;
}

export function renderPageEditor({ page = null, csrf, flash = null, error = "" }) {
  const p = page || { title: "", slug: "", status: "draft", sections: [], is_home: 0 };
  return `${flash || ""}${error ? `<div class="flash flash-error">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
  <div class="editor-layout">
    <div>
      <section class="card"><div class="card-pad">
        <h2>Page details</h2>
        <form method="post" action="${page ? `/admin/pages/${esc(page.id)}` : "/admin/pages"}" class="form-grid">
          ${csrfField(csrf)}
          ${page ? `<input type="hidden" name="id" value="${esc(page.id)}">` : ""}
          ${field({ name: "title", label: "Title", required: true, value: p.title })}
          ${field({ name: "slug", label: "URL slug", value: p.slug, help: p.is_home ? "The homepage lives at /." : "Leave blank to derive from the title." })}
          ${field({ name: "status", label: "Status", type: "select", value: p.status, options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }] })}
          ${field({ name: "is_home", label: "Use as homepage", type: "checkbox", value: !!p.is_home, help: "Only one page can be the homepage." })}
          ${field({ name: "seo_title", label: "SEO title", value: p.seo_title || "" })}
          ${field({ name: "seo_description", label: "Meta description", type: "textarea", rows: 2, value: p.seo_description || "" })}
          <div class="form-actions span-2"><button class="btn btn-primary" type="submit">Save page</button>
          ${page ? `<button class="btn btn-ghost text-danger" type="submit" formaction="/admin/pages/${esc(page.id)}/delete" data-confirm="Delete this page? Its sections go with it.">Delete</button>` : ""}</div>
        </form>
      </div></section>

      ${page ? `<section class="card"><div class="card-head"><h2>Sections</h2><span class="muted">${p.sections.length} block${p.sections.length === 1 ? "" : "s"}</span></div>
        ${p.sections.length ? `<div class="section-list">${p.sections.map((s, i) => `<div class="section-row">
          <span class="section-icon">${icon(SECTION_TYPES[s.type]?.icon || "layout", { size: 18 })}</span>
          <div class="section-row-main"><strong>${esc(SECTION_TYPES[s.type]?.label || s.type)}</strong>
            <small>${esc(sectionSummary(s))}</small></div>
          <div class="section-row-actions">
            <form method="post" action="/admin/pages/${esc(page.id)}/sections/${esc(s.id)}/move">${csrfField(csrf)}<input type="hidden" name="direction" value="up"><button class="icon-btn" ${i === 0 ? "disabled" : ""} aria-label="Move up">${icon("chevron", { size: 16, cls: "up" })}</button></form>
            <form method="post" action="/admin/pages/${esc(page.id)}/sections/${esc(s.id)}/move">${csrfField(csrf)}<input type="hidden" name="direction" value="down"><button class="icon-btn" ${i === p.sections.length - 1 ? "disabled" : ""} aria-label="Move down">${icon("chevron", { size: 16 })}</button></form>
            <a class="btn btn-ghost btn-sm" href="/admin/pages/${esc(page.id)}/sections/${esc(s.id)}">Edit</a>
            <form method="post" action="/admin/pages/${esc(page.id)}/sections/${esc(s.id)}/delete" data-confirm="Remove this section?">${csrfField(csrf)}<button class="icon-btn text-danger" aria-label="Remove">${icon("trash", { size: 16 })}</button></form>
          </div>
        </div>`).join("")}</div>` : `<p class="muted card-pad">No sections yet. Add one below.</p>`}
        <div class="card-pad border-top">
          <form method="post" action="/admin/pages/${esc(page.id)}/sections" class="inline-form">
            ${csrfField(csrf)}
            <select class="input input-sm" name="type" required>${SECTION_CHOICES.map((s) => `<option value="${esc(s.key)}">${esc(s.label)} — ${esc(s.description)}</option>`).join("")}</select>
            <button class="btn btn-secondary btn-sm" type="submit">${icon("plus", { size: 16 })} Add section</button>
          </form>
        </div>
      </section>` : `<div class="notice">Save the page first, then add sections.</div>`}
    </div>
    <aside>
      <section class="card"><div class="card-pad">
        <h2>Preview</h2>
        <p class="muted">Changes to a published page are live immediately.</p>
        ${page ? `<a class="btn btn-secondary btn-block" href="${esc(pageUrl(page))}" target="_blank">Open page ↗</a>` : ""}
      </div></section>
      <section class="card"><div class="card-pad">
        <h2>Section types</h2>
        <ul class="tip-list">${SECTION_CHOICES.map((s) => `<li><strong>${esc(s.label)}</strong><span>${esc(s.description)}</span></li>`).join("")}</ul>
      </div></section>
    </aside>
  </div>`;
}

function sectionSummary(s) {
  const bits = [];
  for (const key of ["title", "text", "eyebrow"]) if (s[key]) { bits.push(String(s[key])); break; }
  if (s.type === "product_grid" || s.type === "menu_list") bits.push(s.limit ? `up to ${s.limit} items` : "catalog");
  if (s.type === "service_grid") bits.push("services");
  if (s.type === "gallery") bits.push(`${String(s.images || "").split("\n").filter(Boolean).length} images`);
  return truncate(bits.join(" · ") || "No content yet", 90);
}

export function renderSectionEditor({ page, section, csrf, error = "" }) {
  const def = SECTION_TYPES[section.type];
  const cats = def.fields.categoryId ? listCategories(def.fields.categoryId.kind || "product") : [];
  return `${error ? `<div class="flash flash-error">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
  <form method="post" action="/admin/pages/${esc(page.id)}/sections/${esc(section.id)}" class="settings-form">
    ${csrfField(csrf)}
    <section class="card"><div class="card-pad">
      <h2>${esc(def.label)}</h2>
      <p class="muted">${esc(def.description)}</p>
      <div class="form-grid">
        ${Object.entries(def.fields).map(([key, f]) => sectionField(key, f, section[key], cats)).join("")}
      </div>
    </div></section>
    <div class="sticky-actions">
      <button class="btn btn-primary" type="submit">Save section</button>
      <a class="btn btn-ghost" href="/admin/pages/${esc(page.id)}">Back to page</a>
    </div>
  </form>`;
}

function sectionField(key, f, value, categories) {
  const common = { name: key, label: f.label, value: value ?? "", help: f.help };
  switch (f.type) {
    case "textarea": return field({ ...common, type: "textarea", rows: f.rows || 4 });
    case "bool": return field({ ...common, type: "checkbox", value: !!value });
    case "int": return field({ ...common, type: "number", min: f.min, max: f.max });
    case "enum": return field({ ...common, type: "select", options: f.values.map((v) => ({ value: v, label: v })) });
    case "media": return field({ ...common, help: f.help || "Upload in Media, then paste the filename." });
    case "lines": return field({ ...common, type: "textarea", rows: 4 });
    case "pairs": return field({ ...common, type: "textarea", rows: 4, help: f.help || "One per line: Title | Text" });
    case "category": return field({ ...common, type: "select", options: [{ value: "", label: "All" }, ...categories.map((c) => ({ value: c.id, label: c.name }))] });
    default: return field(common);
  }
}

/* ---------------------------------- nav ----------------------------------- */

export function renderNav({ items, csrf, flash = null }) {
  const group = (location) => items.filter((i) => i.location === location);
  const table = (location, label) => `<section class="card"><div class="card-head"><h2>${label}</h2><small class="muted">Hidden links keep their place.</small></div>
    ${group(location).length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Label</th><th>URL</th><th>Order</th><th>Visible</th><th></th></tr></thead><tbody>
      ${group(location).map((n) => `<tr><td colspan="5" class="nav-edit-cell"><form method="post" action="/admin/navigation/${esc(n.id)}" class="inline-edit">
        ${csrfField(csrf)}<input type="hidden" name="location" value="${esc(location)}">
        <input class="input input-sm" name="label" value="${esc(n.label)}" aria-label="Label" required>
        <input class="input input-sm" name="url" value="${esc(n.url)}" aria-label="URL" required>
        <input class="input input-sm input-narrow" type="number" name="sort" value="${n.sort}" aria-label="Order">
        <label class="check-mini"><input type="checkbox" name="visible" value="1" ${n.visible ? "checked" : ""} aria-label="Visible"></label>
        <button class="btn btn-ghost btn-sm" type="submit">Save</button>
        <button class="btn btn-ghost btn-sm text-danger" type="submit" formaction="/admin/navigation/${esc(n.id)}/delete" data-confirm="Remove this link?">${icon("trash", { size: 15 })}</button>
      </form></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted card-pad">No links.</p>`}
    <div class="card-pad border-top"><form method="post" action="/admin/navigation" class="inline-form">
      ${csrfField(csrf)}<input type="hidden" name="location" value="${esc(location)}">
      <input class="input input-sm" name="label" placeholder="Label" required>
      <input class="input input-sm" name="url" placeholder="/p/about or https://" required>
      <button class="btn btn-secondary btn-sm" type="submit">Add link</button>
    </form></div>
  </section>`;
  return `${flash || ""}${table("header", "Header navigation")}${table("footer", "Footer links")}
  <div class="notice">Catalog, services, booking and contact links appear automatically when their modules are enabled — you do not need to add them here.</div>`;
}

/* ---------------------------------- FAQs ---------------------------------- */

export function renderFaqs({ faqs, csrf, flash = null }) {
  return `${flash || ""}
  <section class="card"><div class="card-head"><h2>Questions</h2><small class="muted">Shown in FAQ sections and on the FAQ page.</small></div>
    ${faqs.length ? faqs.map((f) => `<form method="post" action="/admin/faqs/${esc(f.id)}" class="faq-edit">
      ${csrfField(csrf)}
      <input class="input" name="question" value="${esc(f.question)}" aria-label="Question" required>
      <textarea class="input" name="answer" rows="3" aria-label="Answer" required>${esc(f.answer)}</textarea>
      <div class="inline-actions">
        <label class="check-mini"><input type="checkbox" name="active" value="1" ${f.active ? "checked" : ""}> Visible</label>
        <input class="input input-sm input-narrow" type="number" name="sort" value="${f.sort}" aria-label="Sort order">
        <button class="btn btn-secondary btn-sm" type="submit">Save</button>
        <button class="btn btn-ghost btn-sm text-danger" type="submit" formaction="/admin/faqs/${esc(f.id)}/delete" data-confirm="Delete this question?">Delete</button>
      </div>
    </form>`).join("") : `<p class="muted card-pad">No questions yet.</p>`}
    <div class="card-pad border-top">
      <form method="post" action="/admin/faqs" class="stack">
        ${csrfField(csrf)}
        <input class="input" name="question" placeholder="Question" required>
        <textarea class="input" name="answer" rows="3" placeholder="Answer" required></textarea>
        <button class="btn btn-secondary" type="submit">Add question</button>
      </form>
    </div>
  </section>`;
}

export function renderTestimonials({ items, csrf, flash = null }) {
  return `${flash || ""}
  <section class="card"><div class="card-head"><h2>Testimonials</h2></div>
    ${items.length ? items.map((t) => `<form method="post" action="/admin/testimonials/${esc(t.id)}" class="faq-edit">
      ${csrfField(csrf)}
      <div class="form-grid">
        <input class="input" name="author" value="${esc(t.author)}" placeholder="Author" required>
        <input class="input" name="role" value="${esc(t.role)}" placeholder="Role or context">
      </div>
      <textarea class="input" name="quote" rows="3" required>${esc(t.quote)}</textarea>
      <div class="inline-actions">
        <select class="input input-sm" name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${t.rating === n ? "selected" : ""}>${n} stars</option>`).join("")}</select>
        <label class="check-mini"><input type="checkbox" name="active" value="1" ${t.active ? "checked" : ""}> Visible</label>
        <input class="input input-sm" name="image" value="${esc(t.image || "")}" placeholder="Image (optional)">
        <button class="btn btn-secondary btn-sm" type="submit">Save</button>
        <button class="btn btn-ghost btn-sm text-danger" type="submit" formaction="/admin/testimonials/${esc(t.id)}/delete" data-confirm="Delete this testimonial?">Delete</button>
      </div>
    </form>`).join("") : `<p class="muted card-pad">No testimonials yet.</p>`}
    <div class="card-pad border-top">
      <form method="post" action="/admin/testimonials" class="stack">
        ${csrfField(csrf)}
        <div class="form-grid">
          <input class="input" name="author" placeholder="Author" required>
          <input class="input" name="role" placeholder="Role or context">
        </div>
        <textarea class="input" name="quote" rows="3" placeholder="Quote" required></textarea>
        <button class="btn btn-secondary" type="submit">Add testimonial</button>
      </form>
    </div>
  </section>`;
}
