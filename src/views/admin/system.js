// Admin: media, modules, customers, inquiries, discounts, reviews, users,
// subscribers and small system pages.

import { config } from "../../core/config.js";
import { esc, money, fmtDate, fmtTime, truncate } from "../../core/util.js";
import { icon, field, button, emptyState, statusBadge, badge, ratingStars, pagination } from "../components.js";
import { mediaUrl } from "../../core/media.js";
import { csrfField } from "../layout.js";

const moneyFmt = (c) => money(c, config().business.currency, config().business.locale);

/* --------------------------------- media ---------------------------------- */

export function renderMedia({ items, csrf, flash = null }) {
  return `${flash || ""}
  <div class="toolbar">
    <p class="muted">${items.length} image${items.length === 1 ? "" : "s"}</p>
    <form method="post" action="/admin/media" enctype="multipart/form-data" class="inline-form">
      ${csrfField(csrf)}
      <label class="btn btn-primary btn-sm">${icon("image", { size: 16 })} Upload image<input type="file" name="file" accept="image/*" required hidden data-auto-submit></label>
    </form>
  </div>
  <div class="notice">Images are re-encoded and capped at 2400 px. SVG logos are sanitised. Copy a filename into any image field.</div>
  ${items.length ? `<div class="media-grid">${items.map((m) => `<figure class="media-card">
    <div class="media-thumb">${m.mime === "image/svg+xml" ? `<img src="${esc(mediaUrl(m.filename))}" alt="">` : `<img src="${esc(mediaUrl(m.filename))}" alt="${esc(m.alt)}" loading="lazy">`}</div>
    <figcaption>
      <input class="input input-sm" value="${esc(m.filename)}" readonly aria-label="Filename" onfocus="this.select()">
      <input class="input input-sm" form="alt-${esc(m.id)}" name="alt" value="${esc(m.alt)}" placeholder="Alt text" aria-label="Alt text">
      <div class="inline-actions">
        <form id="alt-${esc(m.id)}" method="post" action="/admin/media/${esc(m.id)}">${csrfField(csrf)}<button class="btn btn-ghost btn-sm">Save alt</button></form>
        <form method="post" action="/admin/media/${esc(m.id)}/delete" data-confirm="Delete this image?" class="inline-form">${csrfField(csrf)}<button class="btn btn-ghost btn-sm text-danger">${icon("trash", { size: 15 })}</button></form>
      </div>
      <small class="muted">${m.width ? `${m.width}×${m.height} · ` : ""}${Math.round((m.size || 0) / 1024)} KB</small>
    </figcaption>
  </figure>`).join("")}</div>` : emptyState("No images yet", "Upload a logo or product photo to get started.")}`;
}

/* -------------------------------- modules --------------------------------- */

export function renderModules({ modules, csrf, flash = null, error = "", catalogStats = {}, serviceStats = {} }) {
  const enabled = modules.filter((m) => m.enabled).length;
  return `${flash || ""}${error ? `<div class="flash flash-error">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
  <div class="callout"><div><strong>${enabled} of ${modules.length} modules on.</strong> Disabling a module hides it and its navigation; it never deletes data. Turn it back on and everything is where you left it.</div></div>
  ${["Foundation", "Selling", "Operations", "Growth"].map((cat) => {
    const group = modules.filter((m) => m.category === cat);
    if (!group.length) return "";
    return `<h2 class="group-title">${esc(cat)}</h2><div class="module-grid">
      ${group.map((m) => {
        const missing = (m.requires || []).filter((r) => !modules.find((x) => x.key === r)?.enabled);
        const dependants = modules.filter((x) => x.enabled && (x.requires || []).includes(m.key));
        return `<article class="module-card ${m.enabled ? "is-on" : ""}">
          <div class="module-head">
            <h3>${esc(m.name)}</h3>
            ${m.enabled ? badge("On", "ok") : badge("Off", "neutral")}
          </div>
          <p>${esc(m.description)}</p>
          <ul class="module-features">${m.features.map((f) => `<li>${icon("check", { size: 13 })} ${esc(f)}</li>`).join("")}</ul>
          ${missing.length ? `<p class="fine text-warn">Needs ${missing.map((k) => esc(modules.find((x) => x.key === k)?.name || k)).join(", ")} first.</p>` : ""}
          ${m.core ? `<p class="fine">Part of the core platform.</p>` : `<form method="post" action="/admin/modules/${esc(m.key)}/toggle">
            ${csrfField(csrf)}
            <input type="hidden" name="enabled" value="${m.enabled ? "0" : "1"}">
            ${dependants.length && m.enabled ? `<input type="hidden" name="cascade" value="1">` : ""}
            <button class="btn ${m.enabled ? "btn-ghost" : "btn-primary"} btn-sm" type="submit" ${m.enabled ? 'data-confirm="Disable this module and any modules that depend on it? No data is deleted."' : ""}>
              ${m.enabled ? "Disable" : "Enable"}
            </button>
            ${m.enabled && !m.core ? `<a class="btn btn-ghost btn-sm" href="/admin/settings/${moduleSettingsPath(m.key)}">Configure</a>` : ""}
          </form>`}
        </article>`;
      }).join("")}
    </div>`;
  }).join("")}`;
}

function moduleSettingsPath(key) {
  return { commerce: "commerce", bookings: "bookings", catalog: "catalog", services: "services", inquiries: "inquiries" }[key] || "";
}

/* -------------------------------- customers -------------------------------- */

export function renderCustomers({ rows, pager, search = "", csrf }) {
  return `<div class="toolbar">
    <form method="get" action="/admin/customers" class="toolbar-search">
      <label class="search">${icon("help", { size: 16 })}<input class="input input-sm" type="search" name="q" value="${esc(search)}" placeholder="Name, email or phone"></label>
      <button class="btn btn-secondary btn-sm" type="submit">Search</button>
    </form>
    <a class="btn btn-ghost btn-sm" href="/admin/customers.csv">${icon("download", { size: 16 })} Export</a>
  </div>
  ${rows.length ? `<div class="table-wrap card"><table class="table table-hover">
    <thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th class="ta-right">Spend</th><th>Marketing</th><th>Joined</th></tr></thead>
    <tbody>${rows.map((c) => `<tr>
      <td><a class="strong" href="/admin/customers/${c.id}">${esc(c.name || "Unnamed")}</a></td>
      <td>${esc(c.email)}<br><small class="muted">${esc(c.phone || "")}</small></td>
      <td>${c.order_count ?? 0}</td>
      <td class="ta-right">${esc(moneyFmt(c.spend_cents || 0))}</td>
      <td>${c.marketing ? badge("Subscribed", "ok") : `<span class="muted">—</span>`}</td>
      <td class="muted">${esc(fmtDate(c.created_at, config().business.timezone))}</td>
    </tr>`).join("")}</tbody></table></div>${pagination(pager, "/admin/customers", { q: search })}`
    : emptyState("No customers yet", "Customers are created automatically by orders, bookings and inquiries.")}`;
}

export function renderCustomer({ customer, orders, bookings, spend, points, csrf, flash = null }) {
  return `${flash || ""}
  <div class="detail-grid">
    <div>
      <section class="card"><div class="card-pad">
        <h2>Orders</h2>
        ${orders.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th class="ta-right">Total</th></tr></thead><tbody>
          ${orders.map((o) => `<tr><td><a href="/admin/orders/${esc(o.number)}">${esc(o.number)}</a></td><td>${esc(fmtDate(o.created_at, config().business.timezone))}</td><td>${statusBadge(o.status)}</td><td class="ta-right">${esc(moneyFmt(o.total_cents))}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">No orders.</p>`}
      </div></section>
      <section class="card"><div class="card-pad">
        <h2>Bookings</h2>
        ${bookings.length ? bookings.map((b) => `<div class="list-row"><div><strong>${esc(b.service_name || "Appointment")}</strong><small>${esc(fmtDate(b.starts_at, config().business.timezone))} · ${esc(fmtTime(b.starts_at, config().business.timezone))}</small></div>${statusBadge(b.status)}</div>`).join("") : `<p class="muted">No bookings.</p>`}
      </div></section>
    </div>
    <aside>
      <section class="card"><div class="card-pad">
        <h2>${esc(customer.name || "Customer")}</h2>
        <p class="muted">${esc(customer.email)}</p>
        <dl class="detail-list">
          <div><dt>Orders</dt><dd>${orders.length}</dd></div>
          <div><dt>Paid spend</dt><dd>${esc(moneyFmt(spend.cents))}</dd></div>
          <div><dt>Points</dt><dd>${points}</dd></div>
          <div><dt>Joined</dt><dd>${esc(fmtDate(customer.created_at, config().business.timezone))}</dd></div>
        </dl>
      </div></section>
      <section class="card"><div class="card-pad">
        <h2>Notes & marketing</h2>
        <form method="post" action="/admin/customers/${customer.id}" class="stack">
          ${csrfField(csrf)}
          <input class="input" name="name" value="${esc(customer.name)}" placeholder="Name">
          <input class="input" name="phone" value="${esc(customer.phone)}" placeholder="Phone">
          <textarea class="input" name="notes" rows="4" placeholder="Notes">${esc(customer.notes)}</textarea>
          <label class="check"><input type="checkbox" name="marketing" value="1" ${customer.marketing ? "checked" : ""}><span>Marketing opt-in</span></label>
          <button class="btn btn-primary btn-block" type="submit">Save customer</button>
        </form>
      </div></section>
    </aside>
  </div>`;
}

/* -------------------------------- inquiries -------------------------------- */

export function renderInquiries({ rows, pager, status = "all", csrf }) {
  return `<div class="tabs">${[["all", "All"], ["new", "New"], ["read", "Read"], ["archived", "Archived"]].map(([k, l]) => `<a class="tab ${status === k ? "is-active" : ""}" href="/admin/inquiries?status=${k}">${l}</a>`).join("")}</div>
  ${rows.length ? `<div class="inquiry-list">${rows.map((i) => `<a class="inquiry-row ${i.status === "new" ? "is-new" : ""}" href="/admin/inquiries/${i.id}">
    <div class="inquiry-who"><strong>${esc(i.name)}</strong><small>${esc(i.email)}</small></div>
    <div class="inquiry-msg"><strong>${esc(i.subject)}</strong><span>${esc(truncate(i.message, 110))}</span></div>
    <div class="inquiry-when">${esc(fmtDate(i.created_at, config().business.timezone))}${i.status === "new" ? badge("New", "warn") : ""}</div>
  </a>`).join("")}</div>${pagination(pager, "/admin/inquiries", { status })}`
    : emptyState("Inbox zero", "Contact and quote requests land here.")}`;
}

export function renderInquiry({ inquiry, csrf, flash = null }) {
  return `${flash || ""}<div class="detail-grid">
    <div><section class="card"><div class="card-pad">
      <h2>${esc(inquiry.subject)}</h2>
      <p class="muted">${esc(inquiry.name)} · ${esc(inquiry.email)}${inquiry.phone ? ` · ${esc(inquiry.phone)}` : ""} · ${esc(fmtDate(inquiry.created_at, config().business.timezone))}</p>
      <div class="prose" style="margin-top:1rem">${esc(inquiry.message).replace(/\n/g, "<br>")}</div>
      <p style="margin-top:1.5rem"><a class="btn btn-primary" href="mailto:${esc(inquiry.email)}?subject=${encodeURIComponent(`Re: ${inquiry.subject}`)}">Reply by email</a></p>
    </div></section></div>
    <aside>
      <section class="card"><div class="card-pad">
        <h2>Status</h2>
        <div class="stack">
          ${["new", "read", "archived"].map((s) => `<form method="post" action="/admin/inquiries/${inquiry.id}/status">${csrfField(csrf)}<input type="hidden" name="status" value="${s}"><button class="btn ${inquiry.status === s ? "btn-primary" : "btn-ghost"} btn-block btn-sm">Mark ${s}</button></form>`).join("")}
        </div>
      </div></section>
      <section class="card"><div class="card-pad">
        <h2>Internal notes</h2>
        <form method="post" action="/admin/inquiries/${inquiry.id}" class="stack">${csrfField(csrf)}
          <textarea class="input" name="notes" rows="4">${esc(inquiry.notes)}</textarea>
          <button class="btn btn-secondary btn-block" type="submit">Save notes</button>
        </form>
      </div></section>
      <p class="fine">Reference ${esc(inquiry.number)}</p>
    </aside>
  </div>`;
}

/* -------------------------------- discounts -------------------------------- */

export function renderDiscounts({ discounts, csrf, flash = null }) {
  return `${flash || ""}
  <div class="toolbar"><p class="muted">${discounts.length} code${discounts.length === 1 ? "" : "s"}</p></div>
  ${discounts.length ? `<div class="table-wrap card"><table class="table"><thead><tr><th>Code</th><th>Value</th><th>Minimum</th><th>Uses</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>
    ${discounts.map((d) => `<tr>
      <td><code class="strong">${esc(d.code)}</code></td>
      <td>${d.kind === "percent" ? `${d.value}%` : esc(moneyFmt(d.value))}</td>
      <td>${d.min_subtotal_cents ? esc(moneyFmt(d.min_subtotal_cents)) : "—"}</td>
      <td>${d.uses}${d.max_uses ? ` / ${d.max_uses}` : ""}</td>
      <td>${d.expires_at ? esc(fmtDate(d.expires_at, config().business.timezone)) : "—"}</td>
      <td>${d.active ? badge("Active", "ok") : badge("Off", "neutral")}</td>
      <td class="ta-right"><div class="inline-actions">
        <form method="post" action="/admin/discounts/${esc(d.id)}/toggle">${csrfField(csrf)}<button class="btn btn-ghost btn-sm">${d.active ? "Disable" : "Enable"}</button></form>
        <form method="post" action="/admin/discounts/${esc(d.id)}/delete" data-confirm="Delete this code?">${csrfField(csrf)}<button class="btn btn-ghost btn-sm text-danger">${icon("trash", { size: 15 })}</button></form>
      </div></td>
    </tr>`).join("")}</tbody></table></div>` : `<div class="notice">No codes yet. Create one below.</div>`}
  <section class="card"><div class="card-head"><h2>New code</h2></div><div class="card-pad">
    <form method="post" action="/admin/discounts" class="form-grid">
      ${csrfField(csrf)}
      ${field({ name: "code", label: "Code", required: true, placeholder: "SPRING10" })}
      ${field({ name: "kind", label: "Type", type: "select", value: "percent", options: [{ value: "percent", label: "Percentage" }, { value: "fixed", label: "Fixed amount" }] })}
      ${field({ name: "value", label: "Value", value: "", placeholder: "10 or 5.00", help: "Percent for a percentage code, dollars for a fixed one.", required: true })}
      ${field({ name: "min_subtotal", label: "Minimum subtotal", type: "money", value: "" })}
      ${field({ name: "max_uses", label: "Maximum uses", type: "number", value: "", min: 1, help: "Blank for unlimited." })}
      ${field({ name: "expires_at", label: "Expires", type: "date", value: "" })}
      <div class="form-actions span-2"><button class="btn btn-primary" type="submit">Create code</button></div>
    </form>
  </div></section>`;
}

/* --------------------------------- reviews -------------------------------- */

export function renderReviews({ reviews, csrf, flash = null }) {
  return `${flash || ""}
  ${reviews.length ? `<div class="review-admin">${reviews.map((r) => `<article class="card review-admin-item">
    <div class="card-pad">
      <div class="review-head">${ratingStars(r.rating)} ${statusBadge(r.status)}<span class="muted">${esc(fmtDate(r.created_at, config().business.timezone))}</span></div>
      <h3>${esc(r.title || "Review")}</h3>
      <p>${esc(r.body)}</p>
      <p class="muted">— ${esc(r.customer_name)}${r.email ? ` · ${esc(r.email)}` : ""}</p>
      <div class="inline-actions">
        ${r.status !== "approved" ? `<form method="post" action="/admin/reviews/${esc(r.id)}/status">${csrfField(csrf)}<input type="hidden" name="status" value="approved"><button class="btn btn-primary btn-sm">Approve</button></form>` : ""}
        ${r.status !== "rejected" ? `<form method="post" action="/admin/reviews/${esc(r.id)}/status">${csrfField(csrf)}<input type="hidden" name="status" value="rejected"><button class="btn btn-ghost btn-sm">Reject</button></form>` : ""}
        <form method="post" action="/admin/reviews/${esc(r.id)}/delete" data-confirm="Delete this review?">${csrfField(csrf)}<button class="btn btn-ghost btn-sm text-danger">Delete</button></form>
      </div>
    </div>
  </article>`).join("")}</div>` : emptyState("No reviews yet", "Reviews submitted on product pages appear here for moderation.")}`;
}

/* ---------------------------------- users ---------------------------------- */

export function renderUsers({ users, csrf, me, flash = null }) {
  const roleHelp = { owner: "Everything, including users.", manager: "Everything except users.", staff: "Orders, bookings, catalog and inquiries.", viewer: "Read-only order and booking access." };
  return `${flash || ""}
  <section class="card"><div class="card-head"><h2>Team</h2><small class="muted">Every action is written to the audit log.</small></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr>
        <td><strong>${esc(u.name)}</strong>${u.id === me.id ? ` ${badge("You", "info")}` : ""}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.role)}<br><small class="muted">${esc(roleHelp[u.role] || "")}</small></td>
        <td class="muted">${u.last_login_at ? esc(fmtDate(u.last_login_at, config().business.timezone)) : "Never"}</td>
        <td>${u.active ? badge("Active", "ok") : badge("Disabled", "danger")}</td>
        <td class="ta-right"><div class="inline-actions">
          <form method="post" action="/admin/users/${u.id}/toggle">${csrfField(csrf)}<button class="btn btn-ghost btn-sm">${u.active ? "Disable" : "Enable"}</button></form>
          <a class="btn btn-ghost btn-sm" href="/admin/users/${u.id}">Edit</a>
        </div></td>
      </tr>`).join("")}
    </tbody></table></div>
  </section>
  <section class="card"><div class="card-head"><h2>Invite a user</h2></div><div class="card-pad">
    <form method="post" action="/admin/users" class="form-grid">
      ${csrfField(csrf)}
      ${field({ name: "name", label: "Name", required: true })}
      ${field({ name: "email", label: "Email", type: "email", required: true })}
      ${field({ name: "role", label: "Role", type: "select", value: "staff", options: [{ value: "owner", label: "Owner" }, { value: "manager", label: "Manager" }, { value: "staff", label: "Staff" }, { value: "viewer", label: "Viewer" }] })}
      ${field({ name: "password", label: "Temporary password", type: "password", required: true, help: "At least 10 characters with a letter and a number. Share it securely." })}
      <div class="form-actions span-2"><button class="btn btn-primary" type="submit">Create user</button></div>
    </form>
  </div></section>`;
}

export function renderUserEdit({ user, csrf, error = "" }) {
  return `${error ? `<div class="flash flash-error">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
  <div class="detail-grid"><div>
    <section class="card"><div class="card-pad"><h2>Profile</h2>
      <form method="post" action="/admin/users/${user.id}" class="form-grid">${csrfField(csrf)}
        ${field({ name: "name", label: "Name", value: user.name, required: true })}
        ${field({ name: "email", label: "Email", type: "email", value: user.email, required: true })}
        ${field({ name: "role", label: "Role", type: "select", value: user.role, options: ["owner", "manager", "staff", "viewer"].map((r) => ({ value: r, label: r })) })}
        <div class="form-actions span-2"><button class="btn btn-primary" type="submit">Save user</button></div>
      </form>
    </div></section>
  </div><aside>
    <section class="card"><div class="card-pad"><h2>Set password</h2>
      <form method="post" action="/admin/users/${user.id}/password" class="stack">${csrfField(csrf)}
        <input class="input" type="password" name="password" placeholder="New password" required autocomplete="new-password">
        <button class="btn btn-secondary btn-block" type="submit">Update password</button>
        <p class="fine">This signs the user out everywhere.</p>
      </form>
    </div></section>
    <section class="card"><div class="card-pad"><h2>Danger</h2>
      <form method="post" action="/admin/users/${user.id}/delete" data-confirm="Delete this user permanently?">${csrfField(csrf)}
        <button class="btn btn-ghost btn-block text-danger" type="submit">Delete user</button>
      </form>
    </div></section>
  </aside></div>`;
}

/* -------------------------------- newsletter ------------------------------- */

export function renderNewsletter({ rows, pager, stats, csrf }) {
  return `<div class="stat-grid">
    <div class="stat"><p class="stat-label">Subscribers</p><p class="stat-value">${stats.total || 0}</p></div>
    <div class="stat"><p class="stat-label">Last 30 days</p><p class="stat-value">${stats.last30 || 0}</p></div>
  </div>
  <div class="toolbar"><p class="muted">${pager.total} active</p><a class="btn btn-ghost btn-sm" href="/admin/newsletter.csv">${icon("download", { size: 16 })} Export CSV</a></div>
  ${rows.length ? `<div class="table-wrap card"><table class="table"><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Joined</th><th></th></tr></thead><tbody>
    ${rows.map((s) => `<tr><td>${esc(s.email)}</td><td>${esc(s.name)}</td><td>${esc(s.source)}</td><td class="muted">${esc(fmtDate(s.created_at, config().business.timezone))}</td>
    <td class="ta-right"><form method="post" action="/admin/newsletter/${s.id}/delete" data-confirm="Remove this subscriber?">${csrfField(csrf)}<button class="btn btn-ghost btn-sm text-danger">Remove</button></form></td></tr>`).join("")}
  </tbody></table></div>${pagination(pager, "/admin/newsletter", {})}` : emptyState("No subscribers", "Enable the Newsletter module to collect emails in the footer.")}`;
}

/* ------------------------------ disabled view ------------------------------ */

export function renderDisabled({ module }) {
  return emptyState(`${module?.name || "This module"} is off`, "Turn it on in Modules to use this area. Existing data is kept.", button({ label: "Go to Modules", href: "/admin/modules", variant: "primary" }));
}

export { moneyFmt };
