// Admin: order book.

import { config } from "../../core/config.js";
import { esc, money, fmtDate, fmtTime } from "../../core/util.js";
import { icon, button, emptyState, statusBadge, pagination } from "../components.js";
import { csrfField } from "../layout.js";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "../../modules/orders.js";

const moneyFmt = (c) => money(c, config().business.currency, config().business.locale);

const TABS = [
  ["all", "All"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"]
];

export function renderOrderList({ orders, pager, filters, csrf, flash = null, counts = {} }) {
  const tz = config().business.timezone;
  return `${flash || ""}
  <div class="tabs">${TABS.map(([k, label]) => `<a class="tab ${filters.status === k || (!filters.status && k === "all") ? "is-active" : ""}" href="/admin/orders?status=${k}">${esc(label)}${counts[k] ? ` <span>${counts[k]}</span>` : ""}</a>`).join("")}</div>
  <div class="toolbar">
    <form method="get" action="/admin/orders" class="toolbar-search">
      <input type="hidden" name="status" value="${esc(filters.status || "all")}">
      <label class="search">${icon("help", { size: 16 })}<input class="input input-sm" type="search" name="q" value="${esc(filters.search || "")}" placeholder="Order number, name or email"></label>
      <button class="btn btn-secondary btn-sm" type="submit">Search</button>
    </form>
    <a class="btn btn-ghost btn-sm" href="/admin/orders.csv?status=${esc(filters.status || "all")}">${icon("download", { size: 16 })} Export</a>
  </div>
  ${orders.length ? `<div class="table-wrap card"><table class="table table-hover">
    <thead><tr><th>Order</th><th>Customer</th><th>Fulfilment</th><th>Payment</th><th>Status</th><th class="ta-right">Total</th></tr></thead>
    <tbody>${orders.map((o) => `<tr class="clickable" data-href="/admin/orders/${esc(o.number)}">
      <td><a class="strong" href="/admin/orders/${esc(o.number)}">${esc(o.number)}</a><br><small class="muted">${esc(fmtDate(o.created_at, tz))} · ${esc(fmtTime(o.created_at, tz))}</small></td>
      <td>${esc(o.name)}<br><small class="muted">${esc(o.email)}</small></td>
      <td>${esc(o.fulfilment)}</td>
      <td>${statusBadge(o.payment_status)}<br><small class="muted">${esc(o.payment_method)}</small></td>
      <td>${statusBadge(o.status)}</td>
      <td class="ta-right strong">${esc(moneyFmt(o.total_cents))}</td>
    </tr>`).join("")}</tbody></table></div>
    ${pagination(pager, "/admin/orders", { status: filters.status, q: filters.search })}`
    : emptyState("No orders here", "Orders placed on the site will appear in this list.")}`;
}

export function renderOrderDetail({ order, items, csrf, flash = null, mailResult = null }) {
  const cfg = config();
  const tz = cfg.business.timezone;
  return `${flash || ""}
  ${mailResult ? `<div class="flash ${mailResult.ok ? "flash-ok" : "flash-error"}">${icon(mailResult.ok ? "check" : "help", { size: 18 })}<span>${esc(mailResult.ok ? "Email sent." : `Email not sent: ${mailResult.error || "not configured"}`)}</span></div>` : ""}
  <div class="detail-grid">
    <div>
      <section class="card"><div class="card-pad">
        <div class="order-title-row">
          <div><h2>${esc(order.number)}</h2><p class="muted">${esc(fmtDate(order.created_at, tz))} at ${esc(fmtTime(order.created_at, tz))}</p></div>
          <div class="status-row">${statusBadge(order.status)} ${statusBadge(order.payment_status)}</div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Item</th><th>SKU</th><th class="ta-right">Unit</th><th class="ta-right">Qty</th><th class="ta-right">Total</th></tr></thead>
          <tbody>${items.map((it) => `<tr><td>${esc(it.name)}</td><td><code>${esc(it.sku)}</code></td><td class="ta-right">${esc(moneyFmt(it.unit_price_cents))}</td><td class="ta-right">${it.qty}</td><td class="ta-right">${esc(moneyFmt(it.line_total_cents))}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="totals">
          <p><span>Subtotal</span><span>${esc(moneyFmt(order.subtotal_cents))}</span></p>
          ${order.discount_cents ? `<p><span>Discount ${esc(order.discount_code)}</span><span>−${esc(moneyFmt(order.discount_cents))}</span></p>` : ""}
          ${order.delivery_cents ? `<p><span>Delivery</span><span>${esc(moneyFmt(order.delivery_cents))}</span></p>` : ""}
          ${order.tax_cents ? `<p><span>${esc(cfg.commerce.taxLabel)}</span><span>${esc(moneyFmt(order.tax_cents))}</span></p>` : ""}
          ${order.tip_cents ? `<p><span>Tip</span><span>${esc(moneyFmt(order.tip_cents))}</span></p>` : ""}
          <p class="total-row"><span>Total</span><span>${esc(moneyFmt(order.total_cents))}</span></p>
        </div>
      </div></section>

      <section class="card"><div class="card-pad">
        <h2>Customer</h2>
        <dl class="detail-list">
          <div><dt>Name</dt><dd>${esc(order.name)}</dd></div>
          <div><dt>Email</dt><dd><a href="mailto:${esc(order.email)}">${esc(order.email)}</a></dd></div>
          <div><dt>Phone</dt><dd>${order.phone ? `<a href="tel:${esc(order.phone.replace(/[^\d+]/g, ""))}">${esc(order.phone)}</a>` : "—"}</dd></div>
          <div><dt>Fulfilment</dt><dd>${esc(order.fulfilment)}</dd></div>
          ${order.address ? `<div><dt>Address</dt><dd>${esc(order.address)}</dd></div>` : ""}
          ${order.notes ? `<div><dt>Customer notes</dt><dd>${esc(order.notes)}</dd></div>` : ""}
        </dl>
      </div></section>
    </div>

    <aside>
      <section class="card"><div class="card-pad">
        <h2>Update status</h2>
        <form method="post" action="/admin/orders/${esc(order.number)}/status" class="stack">
          ${csrfField(csrf)}
          <select class="input" name="status">${ORDER_STATUSES.map((s) => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}</select>
          <button class="btn btn-primary btn-block" type="submit">Save status</button>
        </form>
        <p class="fine">Cancelling returns reserved stock. It does not refund a card payment.</p>
      </div></section>

      <section class="card"><div class="card-pad">
        <h2>Payment</h2>
        <p class="muted">${esc(order.payment_method)} · ${esc(order.payment_status)}${order.paid_at ? ` · ${esc(fmtDate(order.paid_at, tz))}` : ""}</p>
        <div class="stack">
          ${order.payment_status !== "paid" ? `<form method="post" action="/admin/orders/${esc(order.number)}/paid">${csrfField(csrf)}<button class="btn btn-secondary btn-block" type="submit">Mark paid</button></form>` : ""}
          ${order.payment_status === "paid" ? `<form method="post" action="/admin/orders/${esc(order.number)}/refunded" data-confirm="Mark as refunded? Issue the refund in Stripe separately.">${csrfField(csrf)}<button class="btn btn-ghost btn-block text-danger" type="submit">Mark refunded</button></form>` : ""}
          <form method="post" action="/admin/orders/${esc(order.number)}/email">${csrfField(csrf)}<button class="btn btn-ghost btn-block" type="submit">${icon("mail", { size: 16 })} Resend confirmation</button></form>
        </div>
      </div></section>

      <section class="card"><div class="card-pad">
        <h2>Internal notes</h2>
        <form method="post" action="/admin/orders/${esc(order.number)}/notes" class="stack">
          ${csrfField(csrf)}
          <textarea class="input" name="admin_notes" rows="4" placeholder="Only visible to staff">${esc(order.admin_notes || "")}</textarea>
          <button class="btn btn-secondary btn-block" type="submit">Save notes</button>
        </form>
      </div></section>

      <p class="fine"><a href="/order/${esc(order.token)}" target="_blank">Customer view ↗</a></p>
    </aside>
  </div>`;
}
