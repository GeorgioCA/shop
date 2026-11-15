// Bookings and availability. Slots are generated from operating hours, the
// service duration, existing bookings and closures — never stored as rows.

import { db, insert, tx } from "../core/db.js";
import { config } from "../core/config.js";
import {
  id, nowIso, str, emailOk, phoneOk, int, fmtTime, localDateStr, addDays,
  dayOfWeek, hhmmToMinutes, zonedToUtc, localParts, minutesToHhmm, parseLocalDateTime
} from "../core/util.js";
import { getService } from "./services.js";
import { upsertCustomer } from "./customers.js";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ACTIVE = ["pending", "confirmed"];

/* ------------------------------- availability ----------------------------- */

export function dayHours(dateStr) {
  const key = DAY_KEYS[dayOfWeek(dateStr)];
  const h = config().hours.hours[key] || { closed: 1, open: "09:00", close: "17:00" };
  return { key, ...h };
}

export function availability(service, dateStr, { ignoreBookingId = null } = {}) {
  const cfg = config();
  if (!service || !service.active) return { date: dateStr, closed: true, slots: [], reason: "unavailable" };
  const hours = dayHours(dateStr);
  const open = hhmmToMinutes(hours.open);
  const close = hhmmToMinutes(hours.close);
  if (hours.closed || open === null || close === null || close <= open) {
    return { date: dateStr, closed: true, slots: [], reason: "closed" };
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const tz = cfg.business.timezone;
  const now = Date.now();
  const earliest = now + int(cfg.bookings.leadHours, { min: 0, fallback: 0 }) * 3600_000;
  const latest = now + int(cfg.bookings.maxAdvanceDays, { min: 1, fallback: 60 }) * 86400_000;

  const dayStart = zonedToUtc(y, m, d, 0, 0, tz).toISOString();
  const dayEnd = zonedToUtc(y, m, d, 23, 59, tz).toISOString();

  const booked = db.prepare(
    `SELECT starts_at, ends_at FROM bookings
     WHERE status IN ('pending','confirmed') AND starts_at < ? AND ends_at > ? AND id != ?`
  ).all(dayEnd, dayStart, ignoreBookingId ?? -1);

  const closures = db.prepare("SELECT starts_at, ends_at FROM closures WHERE starts_at < ? AND ends_at > ?").all(dayEnd, dayStart);

  const step = Math.max(5, int(cfg.bookings.slotIntervalMin, { fallback: 30 }));
  const duration = Math.max(5, service.duration_min || 60);
  const capacity = Math.max(1, service.capacity || 1);
  const slots = [];

  const buffer = Math.max(0, service.buffer_min || 0);
  for (let minute = open; minute + duration <= close; minute += step) {
    const startsAt = zonedToUtc(y, m, d, Math.floor(minute / 60), minute % 60, tz);
    // The slot reserves cleanup/travel time after the appointment.
    const endsAt = new Date(startsAt.getTime() + (duration + buffer) * 60_000);
    const visibleEnd = new Date(startsAt.getTime() + duration * 60_000);
    const startMs = startsAt.getTime();
    const endMs = endsAt.getTime();

    let remaining = capacity;
    let blocked = false;
    for (const b of booked) {
      if (new Date(b.starts_at).getTime() < endMs && new Date(b.ends_at).getTime() > startMs) remaining -= 1;
    }
    for (const c of closures) {
      if (new Date(c.starts_at).getTime() < endMs && new Date(c.ends_at).getTime() > startMs) blocked = true;
    }
    if (startMs < earliest || startMs > latest) remaining = 0;

    slots.push({
      start: startsAt.toISOString(),
      end: endsAt.toISOString(),
      label: fmtTime(startsAt, tz),
      endLabel: fmtTime(visibleEnd, tz),
      available: !blocked && remaining > 0,
      remaining: Math.max(0, remaining)
    });
  }

  return { date: dateStr, closed: false, slots, hours: { open: hours.open, close: hours.close } };
}

// Next N days that have at least one free slot. Used on /book and the homepage.
export function availabilityWindow(service, days = 14, from = null) {
  const start = from || localDateStr(new Date(), config().business.timezone);
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const day = availability(service, date);
    out.push(day);
  }
  return out;
}

export function nextAvailable(service, days = 30) {
  const start = localDateStr(new Date(), config().business.timezone);
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const day = availability(service, date);
    const slot = day.slots.find((s) => s.available);
    if (slot) return { date, slot };
  }
  return null;
}

/* --------------------------------- writes -------------------------------- */

function bookingNumber() {
  const prefix = str(config().bookings.bookingPrefix, 8) || "BK-";
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  for (let i = 0; i < 40; i++) {
    const candidate = `${prefix}${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    if (!db.prepare("SELECT 1 FROM bookings WHERE number = ?").get(candidate)) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

export function createBooking(input) {
  const cfg = config();
  const service = getService(input.service_id);
  if (!service || !service.active) throw new Error("That service is not available.");

  const name = str(input.name, 120);
  const email = str(input.email, 160).toLowerCase();
  const phone = str(input.phone, 40);
  if (name.length < 2) throw new Error("Enter your name.");
  if (!emailOk(email)) throw new Error("Enter a valid email address.");
  if (cfg.bookings.requirePhone && !phoneOk(phone)) throw new Error("Enter a phone number so we can reach you.");

  const startsAt = new Date(String(input.starts_at || ""));
  if (Number.isNaN(startsAt.getTime())) throw new Error("Choose a time.");
  const dateStr = localDateStr(startsAt, cfg.business.timezone);
  const day = availability(service, dateStr);
  const slot = day.slots.find((s) => new Date(s.start).getTime() === startsAt.getTime() && s.available);
  if (!slot) throw new Error("That time is no longer available. Please choose another.");

  const token = id("bt_");
  const status = cfg.bookings.confirmationMode === "auto" ? "confirmed" : "pending";
  const number = bookingNumber();

  const booking = tx(() => {
    const customer = upsertCustomer({ email, name, phone });
    const info = insert("bookings", {
      number,
      token,
      created_at: nowIso(),
      updated_at: nowIso(),
      service_id: service.id,
      service_name: service.name,
      staff_id: input.staff_id || null,
      customer_id: customer.id,
      name,
      email,
      phone,
      starts_at: slot.start,
      ends_at: slot.end,
      price_cents: service.price_type === "quote" ? 0 : service.price_cents,
      status,
      notes: str(input.notes, 1000),
      admin_notes: ""
    });
    return { id: Number(info.lastInsertRowid), number, token, status };
  });

  return getBooking(booking.id);
}

export function getBooking(identifier) {
  if (identifier === undefined || identifier === null || identifier === "") return null;
  const asId = Number(identifier);
  return Number.isInteger(asId) && String(asId) === String(identifier)
    ? db.prepare("SELECT * FROM bookings WHERE id = ?").get(asId) || null
    : db.prepare("SELECT * FROM bookings WHERE token = ? OR number = ?").get(String(identifier), String(identifier)) || null;
}

export function setBookingStatus(bookingId, status) {
  const allowed = ["pending", "confirmed", "completed", "cancelled", "no_show"];
  if (!allowed.includes(status)) throw new Error("Unknown booking status.");
  db.prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), bookingId);
  return getBooking(bookingId);
}

export function deleteBooking(bookingId) {
  db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);
}

export function listBookings({ from = null, to = null, status = "", search = "", limit = 200, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push("starts_at >= ?"); params.push(from); }
  if (to) { where.push("starts_at <= ?"); params.push(to); }
  if (status && status !== "all") { where.push("status = ?"); params.push(status); }
  if (search) { where.push("(name LIKE ? OR email LIKE ? OR number LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const sql = `SELECT * FROM bookings ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY starts_at ASC LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, Number(limit), Number(offset));
}

export function countBookings(where = "1=1", params = []) {
  return db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE ${where}`).get(...params).n;
}

export function bookingsForDay(dateStr) {
  const tz = config().business.timezone;
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = zonedToUtc(y, m, d, 0, 0, tz).toISOString();
  const end = zonedToUtc(y, m, d, 23, 59, tz).toISOString();
  return db.prepare("SELECT * FROM bookings WHERE starts_at >= ? AND starts_at <= ? ORDER BY starts_at").all(start, end);
}

export function upcomingBookings(limit = 6) {
  return db.prepare(
    "SELECT * FROM bookings WHERE status IN ('pending','confirmed') AND starts_at >= ? ORDER BY starts_at ASC LIMIT ?"
  ).all(nowIso(), limit);
}

export function bookingStats() {
  const today = localDateStr(new Date(), config().business.timezone);
  const [y, m, d] = today.split("-").map(Number);
  const start = zonedToUtc(y, m, d, 0, 0, config().business.timezone).toISOString();
  const end = zonedToUtc(y, m, d, 23, 59, config().business.timezone).toISOString();
  return {
    today: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE starts_at BETWEEN ? AND ? AND status IN ('pending','confirmed')").get(start, end).n,
    upcoming: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE starts_at >= ? AND status IN ('pending','confirmed')").get(nowIso()).n,
    pending: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending'").get().n,
    week: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE starts_at BETWEEN ? AND ? AND status IN ('pending','confirmed')")
      .get(nowIso(), new Date(Date.now() + 7 * 86400_000).toISOString()).n
  };
}

/* -------------------------------- closures ------------------------------- */

export function listClosures({ upcomingOnly = false } = {}) {
  return db.prepare(`SELECT * FROM closures ${upcomingOnly ? "WHERE ends_at >= ?" : ""} ORDER BY starts_at`)
    .all(...(upcomingOnly ? [nowIso()] : []));
}

export function addClosure({ starts_at, ends_at, reason = "" }) {
  const tz = config().business.timezone;
  // Both ISO strings (API) and datetime-local values (admin form) are accepted;
  // a bare local value is interpreted in the business's zone.
  const local = (v) => (/Z$|[+-]\d{2}:?\d{2}$/.test(String(v)) ? new Date(v) : parseLocalDateTime(v, tz));
  const start = local(starts_at);
  const end = local(ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Enter a start and end.");
  if (end <= start) throw new Error("The end must be after the start.");
  insert("closures", { id: id("cl_"), starts_at: start.toISOString(), ends_at: end.toISOString(), reason: str(reason, 200), created_at: nowIso() });
}

export function deleteClosure(closureId) {
  db.prepare("DELETE FROM closures WHERE id = ?").run(closureId);
}

export { availabilityWindow as window, DAY_KEYS, minutesToHhmm, localParts };
