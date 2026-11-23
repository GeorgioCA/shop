// Customer records are created by orders and bookings; a customer account is
// optional. One installation only ever holds its own customers.

import crypto from "node:crypto";
import { db, insert } from "../core/db.js";
import { hashPassword, verifyPassword, passwordProblem } from "../core/auth.js";
import { nowIso, str, int, bool, emailOk, paginate } from "../core/util.js";

export function upsertCustomer({ email, name = "", phone = "", marketing = null }) {
  const cleanEmail = str(email, 160).toLowerCase();
  if (!emailOk(cleanEmail)) throw new Error("Enter a valid email address.");
  const existing = db.prepare("SELECT * FROM customers WHERE email = ?").get(cleanEmail);
  if (existing) {
    const nextName = str(name, 120) || existing.name;
    const nextPhone = str(phone, 40) || existing.phone;
    const nextMarketing = marketing === null ? existing.marketing : (bool(marketing) ? 1 : 0);
    db.prepare("UPDATE customers SET name = ?, phone = ?, marketing = ?, last_seen_at = ? WHERE id = ?")
      .run(nextName, nextPhone, nextMarketing, nowIso(), existing.id);
    return getCustomer(existing.id);
  }
  const info = insert("customers", {
    email: cleanEmail,
    name: str(name, 120),
    phone: str(phone, 40),
    marketing: marketing === null ? 0 : (bool(marketing) ? 1 : 0),
    created_at: nowIso(),
    last_seen_at: nowIso()
  });
  return getCustomer(Number(info.lastInsertRowid));
}

export function getCustomer(customerId) {
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(Number(customerId)) || null;
}

export function getCustomerByEmail(email) {
  return db.prepare("SELECT * FROM customers WHERE email = ?").get(String(email || "").toLowerCase()) || null;
}

export function listCustomers({ search = "", page = 1, perPage = 25 } = {}) {
  const where = search ? "WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?" : "";
  const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers ${where}`).get(...params).n;
  const pager = paginate(total, page, perPage);
  const rows = db.prepare(`SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pager.perPage, pager.offset);
  return { rows, pager };
}

export function updateCustomer(customerId, patch) {
  const customer = getCustomer(customerId);
  if (!customer) throw new Error("Customer not found.");
  const next = {};
  if (patch.name !== undefined) next.name = str(patch.name, 120);
  if (patch.phone !== undefined) next.phone = str(patch.phone, 40);
  if (patch.notes !== undefined) next.notes = str(patch.notes, 4000);
  if (patch.marketing !== undefined) next.marketing = bool(patch.marketing) ? 1 : 0;
  const keys = Object.keys(next);
  if (keys.length) {
    db.prepare(`UPDATE customers SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => next[k]), customerId);
  }
  return getCustomer(customerId);
}

export function customerOrders(customerId) {
  return db.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC").all(customerId);
}

export function customerBookings(customerId) {
  return db.prepare("SELECT * FROM bookings WHERE customer_id = ? ORDER BY starts_at DESC").all(customerId);
}

export function customerSpend(customerId) {
  return db.prepare(
    "SELECT COALESCE(SUM(total_cents),0) AS cents, COUNT(*) AS orders FROM orders WHERE customer_id = ? AND payment_status = 'paid'"
  ).get(customerId);
}

export function customerStats() {
  return db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN marketing = 1 THEN 1 ELSE 0 END) AS subscribers,
      SUM(CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) AS accounts
    FROM customers`).get();
}

export function setCustomerMarketing(customerId, on) {
  db.prepare("UPDATE customers SET marketing = ? WHERE id = ?").run(on ? 1 : 0, customerId);
}

/* ----------------------------- customer accounts -------------------------- */

const VERIFICATION_TTL_MS = 48 * 3600_000;

/**
 * Start account registration. The password hash is parked in
 * pending_password_hash and only becomes the real password after the owner of
 * the email address clicks the verification link. Without this, anyone could
 * claim any email that has ever ordered.
 */
export function requestCustomerAccount(email, password, name = "") {
  const customer = getCustomerByEmail(email);
  if (!customer) throw new Error("Place an order first, then create an account with the same email.");
  if (customer.password_hash) throw new Error("An account already exists for that email. Sign in instead.");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const token = crypto.randomBytes(24).toString("base64url");
  db.prepare(
    "UPDATE customers SET pending_password_hash = ?, name = ?, verification_token = ?, verification_expires = ? WHERE id = ?"
  ).run(hashPassword(password), str(name, 120) || customer.name, token, new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(), customer.id);
  return { customer: getCustomer(customer.id), token };
}

export function pendingCustomerVerification(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM customers WHERE verification_token = ?").get(String(token));
  if (!row || !row.pending_password_hash) return null;
  if (row.verification_expires && new Date(row.verification_expires).getTime() < Date.now()) return null;
  return row;
}

/** Completes registration: activates the parked password and signs old sessions out. */
export function verifyCustomerAccount(token) {
  const row = pendingCustomerVerification(token);
  if (!row) return null;
  db.prepare(
    `UPDATE customers SET password_hash = pending_password_hash, pending_password_hash = NULL,
       verification_token = NULL, verification_expires = NULL, session_version = session_version + 1
     WHERE id = ?`
  ).run(row.id);
  return getCustomer(row.id);
}

export function setCustomerPassword(customerId, password) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  // Bumping session_version signs out every existing customer session.
  db.prepare("UPDATE customers SET password_hash = ?, pending_password_hash = NULL, verification_token = NULL, verification_expires = NULL, session_version = session_version + 1 WHERE id = ?")
    .run(hashPassword(password), customerId);
}

export function verifyCustomer(email, password) {
  const customer = getCustomerByEmail(email);
  if (!customer?.password_hash) return null;
  return verifyPassword(password, customer.password_hash) ? customer : null;
}

export function customerPoints(customerId) {
  if (!customerId) return 0;
  return db.prepare("SELECT COALESCE(SUM(points),0) AS n FROM loyalty_ledger WHERE customer_id = ?").get(Number(customerId)).n;
}

export function addPoints(customerId, points, reason, orderId = null) {
  if (!points) return;
  insert("loyalty_ledger", {
    customer_id: customerId,
    points: int(points, { fallback: 0 }),
    reason: str(reason, 200),
    order_id: orderId,
    created_at: nowIso()
  });
  db.prepare("UPDATE customers SET points = (SELECT COALESCE(SUM(points),0) FROM loyalty_ledger WHERE customer_id = ?) WHERE id = ?")
    .run(customerId, customerId);
}
