// Admin: services, staff and booking rules.

import { config } from "../../core/config.js";
import { esc, money, centsInput } from "../../core/util.js";
import { icon, field, button, emptyState, statusBadge } from "../components.js";
import { mediaUrl } from "../../core/media.js";
import { csrfField } from "../layout.js";
import { pairsToText } from "../../modules/catalog.js";

const moneyFmt = (c) => money(c, config().business.currency, config().business.locale);

export function renderServiceList({ services, staff, csrf, flash = null }) {
  return `${flash || ""}
  <div class="toolbar">
    <p class="muted">${services.length} service${services.length === 1 ? "" : "s"}</p>
    <div class="toolbar-actions">
      ${button({ label: "Manage staff", href: "/admin/staff", variant: "ghost", size: "sm" })}
      ${button({ label: "New service", href: "/admin/services/new", variant: "primary", size: "sm", icon: "plus" })}
    </div>
  </div>
  ${services.length ? `<div class="table-wrap card"><table class="table table-hover">
    <thead><tr><th>Service</th><th>Duration</th><th class="ta-right">Price</th><th>Status</th><th></th></tr></thead>
    <tbody>${services.map((s) => `<tr>
      <td><a class="strong" href="/admin/services/${esc(s.id)}">${esc(s.name)}</a><br><small class="muted">${esc(s.sku || "No SKU")}</small></td>
      <td>${s.duration_min} min</td>
      <td class="ta-right">${s.price_type === "quote" ? "Quote" : `${s.price_type === "from" ? "from " : ""}${esc(moneyFmt(s.price_cents))}`}</td>
      <td>${s.active ? statusBadge("active") : statusBadge("draft")}${s.featured ? ` ${statusBadge("featured")}` : ""}</td>
      <td class="ta-right"><a class="btn btn-ghost btn-sm" href="/admin/services/${esc(s.id)}">Edit</a></td>
    </tr>`).join("")}</tbody></table></div>`
    : emptyState("No services yet", "Add services to take bookings and show what you do.", button({ label: "New service", href: "/admin/services/new", variant: "primary" }))}`;
}

export function renderServiceForm({ service = null, categories, staff = [], csrf, error = "" }) {
  const s = service || {};
  return `${error ? `<div class="flash flash-error">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
  <form method="post" action="${service ? `/admin/services/${esc(service.id)}` : "/admin/services"}" class="settings-form">
    ${csrfField(csrf)}
    ${service ? `<input type="hidden" name="id" value="${esc(service.id)}">` : ""}
    <div class="editor-layout">
      <div>
        <section class="card"><div class="card-pad">
          <h2>Basics</h2>
          <div class="form-grid">
            ${field({ name: "name", label: "Name", required: true, value: s.name || "" })}
            ${field({ name: "category_id", label: "Category", type: "select", value: s.category_id || "", options: [{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))] })}
            ${field({ name: "sku", label: "SKU", value: s.sku || "" })}
            ${field({ name: "duration_min", label: "Duration (minutes)", type: "number", value: s.duration_min ?? 60, min: 5, max: 1440 })}
          </div>
          ${field({ name: "short_desc", label: "Short description", value: s.short_desc || "" })}
          ${field({ name: "description", label: "Description", type: "textarea", value: s.description || "", rows: 7 })}
        </div></section>
        <section class="card"><div class="card-pad">
          <h2>Pricing</h2>
          <div class="form-grid">
            ${field({ name: "price_type", label: "Price type", type: "select", value: s.price_type || "fixed", options: [{ value: "fixed", label: "Fixed price" }, { value: "from", label: "Starting from" }, { value: "quote", label: "Quote only" }] })}
            ${field({ name: "price", label: "Price", type: "money", value: centsInput(s.price_cents ?? 0) })}
          </div>
          <div class="form-grid">
            ${field({ name: "buffer_min", label: "Buffer after (minutes)", type: "number", value: s.buffer_min ?? 0, min: 0, max: 240, help: "Cleanup or travel time between bookings." })}
            ${field({ name: "capacity", label: "Capacity per slot", type: "number", value: s.capacity ?? 1, min: 1, max: 100, help: "How many bookings can share a time." })}
          </div>
        </div></section>
      </div>
      <aside>
        <section class="card"><div class="card-pad">
          <h2>Visibility</h2>
          ${field({ name: "active", label: "Offered on the site", type: "checkbox", value: s.active !== 0 })}
          ${field({ name: "featured", label: "Featured", type: "checkbox", value: s.featured !== 0 })}
          ${field({ name: "sort", label: "Sort order", type: "number", value: s.sort ?? 100, min: 0 })}
          ${field({ name: "attributes", label: "Attributes", type: "textarea", value: pairsToText(s.attributes), rows: 4, help: "One per line: Label | Value" })}
        </div></section>
        <section class="card"><div class="card-pad">
          <h2>Image</h2>
          ${field({ name: "image", label: "Image", value: s.image || "" })}
          <label class="btn btn-secondary btn-sm btn-block">${icon("image", { size: 16 })} Upload<input type="file" hidden data-upload-for="image"></label>
          <div class="media-preview-lg" data-preview-for="image">${s.image ? `<img src="${esc(mediaUrl(s.image))}" alt="">` : ""}</div>
        </div></section>
      </aside>
    </div>
    <div class="sticky-actions">
      <button class="btn btn-primary" type="submit">${service ? "Save service" : "Create service"}</button>
      <a class="btn btn-ghost" href="/admin/services">Cancel</a>
      ${service ? `<button class="btn btn-ghost text-danger" type="submit" formaction="/admin/services/${esc(service.id)}/delete" data-confirm="Delete this service?">Delete</button>` : ""}
    </div>
  </form>`;
}

export function renderStaff({ staff, csrf }) {
  return `<section class="card"><div class="card-head"><h2>Staff</h2><small class="muted">Optional — used when customers can choose a person.</small></div>
    ${staff.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Title</th><th>Contact</th><th>Status</th><th></th></tr></thead><tbody>
      ${staff.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.title)}</td><td>${esc(p.email || p.phone || "—")}</td><td>${p.active ? statusBadge("active") : statusBadge("draft")}</td>
      <td class="ta-right"><form method="post" action="/admin/staff/${esc(p.id)}/delete" data-confirm="Remove this staff member?">${csrfField(csrf)}<button class="btn btn-ghost btn-sm text-danger">Remove</button></form></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted card-pad">No staff added.</p>`}
    <div class="card-pad border-top">
      <form method="post" action="/admin/staff" class="inline-form">
        ${csrfField(csrf)}
        <input class="input input-sm" name="name" placeholder="Name" required>
        <input class="input input-sm" name="title" placeholder="Title">
        <input class="input input-sm" name="email" type="email" placeholder="Email">
        <button class="btn btn-secondary btn-sm" type="submit">Add staff</button>
      </form>
    </div>
  </section>`;
}
