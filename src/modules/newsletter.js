// Newsletter subscribers. Separate from customers: someone can subscribe
// without ever ordering.

import { db, insert } from "../core/db.js";
import { nowIso, str, emailOk, paginate, toCsv } from "../core/util.js";

export function subscribe(email, name = "", source = "site") {
  const clean = str(email, 160).toLowerCase();
  if (!emailOk(clean)) throw new Error("Enter a valid email address.");
  const existing = db.prepare("SELECT * FROM newsletter WHERE email = ?").get(clean);
  if (existing) return { row: existing, already: true };
  const info = insert("newsletter", { email: clean, name: str(name, 120), source: str(source, 40), created_at: nowIso() });
  return { row: db.prepare("SELECT * FROM newsletter WHERE id = ?").get(Number(info.lastInsertRowid)), already: false };
}

export function listSubscribers({ page = 1, perPage = 50 } = {}) {
  const total = db.prepare("SELECT COUNT(*) AS n FROM newsletter WHERE unsubscribed_at IS NULL").get().n;
  const pager = paginate(total, page, perPage);
  const rows = db.prepare("SELECT * FROM newsletter WHERE unsubscribed_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(pager.perPage, pager.offset);
  return { rows, pager };
}

export function unsubscribe(email) {
  db.prepare("UPDATE newsletter SET unsubscribed_at = ? WHERE email = ?").run(nowIso(), str(email, 160).toLowerCase());
}

export function deleteSubscriber(subscriberId) {
  db.prepare("DELETE FROM newsletter WHERE id = ?").run(subscriberId);
}

export function subscribersCsv() {
  const rows = db.prepare("SELECT email, name, source, created_at FROM newsletter WHERE unsubscribed_at IS NULL ORDER BY created_at DESC").all();
  return toCsv(rows, [
    { label: "Email", value: (r) => r.email },
    { label: "Name", value: (r) => r.name },
    { label: "Source", value: (r) => r.source },
    { label: "Joined", value: (r) => r.created_at }
  ]);
}

export function subscriberStats() {
  return db.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last30 FROM newsletter WHERE unsubscribed_at IS NULL"
  ).get(new Date(Date.now() - 30 * 86400_000).toISOString());
}
