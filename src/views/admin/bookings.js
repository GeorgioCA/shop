// Admin: bookings, day sheet and closures.

import { config } from "../../core/config.js";
import { esc, fmtDate, fmtTime, localDateStr, addDays, money } from "../../core/util.js";
import { icon, button, emptyState, statusBadge, field } from "../components.js";
import { csrfField } from "../layout.js";

const moneyFmt = (c) => money(c, config().business.currency, config().business.locale);

export function renderBookingList({ bookings, date, status = "all", csrf, flash = null, closures = [] }) {
  const tz = config().business.timezone;
  return `${flash || ""}
  <div class="toolbar">
    <div class="date-nav">
      <a class="btn btn-ghost btn-sm" href="/admin/bookings?date=${esc(addDays(date, -1))}" aria-label="Previous day">${icon("chevron", { size: 16, cls: "flip" })}</a>
      <form method="get" action="/admin/bookings" class="inline-form">
        <input class="input input-sm" type="date" name="date" value="${esc(date)}">
        <button class="btn btn-secondary btn-sm" type="submit">Go</button>
      </form>
      <a class="btn btn-ghost btn-sm" href="/admin/bookings?date=${esc(addDays(date, 1))}" aria-label="Next day">${icon("chevron", { size: 16 })}</a>
      <a class="btn btn-ghost btn-sm" href="/admin/bookings?date=${esc(localDateStr(new Date(), tz))}">Today</a>
    </div>
    <div class="toolbar-actions">
      <a class="btn btn-ghost btn-sm" href="/admin/bookings?view=upcoming">All upcoming</a>
      ${button({ label: "Add time off", href: "#closures", variant: "secondary", size: "sm" })}
    </div>
  </div>
  <p class="muted">${esc(fmtDate(`${date}T12:00:00Z`, "UTC", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }))}</p>
  ${bookings.length ? `<div class="booking-list">${bookings.map((b) => `<article class="booking-row">
    <div class="booking-time"><strong>${esc(fmtTime(b.starts_at, tz))}</strong><small>${esc(fmtTime(b.ends_at, tz))}</small></div>
    <div class="booking-main"><strong>${esc(b.service_name || "Appointment")}</strong><span>${esc(b.name)} · ${esc(b.email)}${b.phone ? ` · ${esc(b.phone)}` : ""}</span>${b.notes ? `<small class="muted">“${esc(b.notes)}”</small>` : ""}</div>
    <div class="booking-state">${statusBadge(b.status)}</div>
    <div class="booking-actions">
      ${b.status === "pending" ? `<form method="post" action="/admin/bookings/${b.id}/status">${csrfField(csrf)}<input type="hidden" name="status" value="confirmed"><button class="btn btn-primary btn-sm">Confirm</button></form>` : ""}
      ${b.status === "confirmed" ? `<form method="post" action="/admin/bookings/${b.id}/status">${csrfField(csrf)}<input type="hidden" name="status" value="completed"><button class="btn btn-secondary btn-sm">Complete</button></form>` : ""}
      ${["pending", "confirmed"].includes(b.status) ? `<form method="post" action="/admin/bookings/${b.id}/status" data-confirm="Cancel this booking?">${csrfField(csrf)}<input type="hidden" name="status" value="cancelled"><button class="btn btn-ghost btn-sm text-danger">Cancel</button></form>` : ""}
    </div>
  </article>`).join("")}</div>` : emptyState("No bookings", "Nothing booked for this day.")}

  <section class="card" id="closures"><div class="card-head"><h2>Time off</h2><small class="muted">Blocks slots for everyone.</small></div>
    ${closures.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>From</th><th>To</th><th>Reason</th><th></th></tr></thead><tbody>
      ${closures.map((c) => `<tr><td>${esc(fmtDate(c.starts_at, tz))} ${esc(fmtTime(c.starts_at, tz))}</td><td>${esc(fmtDate(c.ends_at, tz))} ${esc(fmtTime(c.ends_at, tz))}</td><td>${esc(c.reason)}</td>
      <td class="ta-right"><form method="post" action="/admin/closures/${esc(c.id)}/delete">${csrfField(csrf)}<button class="btn btn-ghost btn-sm text-danger">Remove</button></form></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted card-pad">No closures.</p>`}
    <div class="card-pad border-top">
      <form method="post" action="/admin/closures" class="closure-form">
        ${csrfField(csrf)}
        ${field({ name: "starts_at", label: "Starts", type: "datetime-local", required: true })}
        ${field({ name: "ends_at", label: "Ends", type: "datetime-local", required: true })}
        ${field({ name: "reason", label: "Reason", value: "", placeholder: "Holiday, training…" })}
        <button class="btn btn-secondary" type="submit">Block time</button>
      </form>
    </div>
  </section>`;
}
