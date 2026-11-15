// Inquiries: contact forms, quote requests and questions — one inbox.

import { db, insert } from "../core/db.js";
import { nowIso, str, emailOk, int, paginate } from "../core/util.js";
import { config } from "../core/config.js";

export function createInquiry(input) {
  const name = str(input.name, 120);
  const email = str(input.email, 160).toLowerCase();
  const message = str(input.message, 5000);
  if (name.length < 2) throw new Error("Enter your name.");
  if (!emailOk(email)) throw new Error("Enter a valid email address.");
  if (message.length < 5) throw new Error("Tell us a little more.");

  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  let number;
  do {
    number = `INQ-${stamp}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  } while (db.prepare("SELECT 1 FROM inquiries WHERE number = ?").get(number));

  const info = insert("inquiries", {
    number,
    created_at: nowIso(),
    name,
    email,
    phone: str(input.phone, 40),
    subject: str(input.subject, 160) || `Website inquiry`,
    message,
    source: str(input.source, 40) || "contact",
    status: "new",
    notes: ""
  });
  return getInquiry(Number(info.lastInsertRowid));
}

export function getInquiry(inquiryId) {
  return db.prepare("SELECT * FROM inquiries WHERE id = ?").get(Number(inquiryId)) || null;
}

export function listInquiries({ status = "", page = 1, perPage = 25 } = {}) {
  const where = status && status !== "all" ? "WHERE status = ?" : "";
  const params = where ? [status] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM inquiries ${where}`).get(...params).n;
  const pager = paginate(total, page, perPage);
  return {
    rows: db.prepare(`SELECT * FROM inquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, pager.perPage, pager.offset),
    pager
  };
}

export function setInquiryStatus(inquiryId, status) {
  if (!["new", "read", "archived"].includes(status)) throw new Error("Unknown inquiry status.");
  db.prepare("UPDATE inquiries SET status = ? WHERE id = ?").run(status, inquiryId);
}

export function saveInquiryNotes(inquiryId, notes) {
  db.prepare("UPDATE inquiries SET notes = ? WHERE id = ?").run(str(notes, 4000), inquiryId);
}

export function inquiryStats() {
  return db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS unread FROM inquiries`).get();
}

export function deleteInquiry(inquiryId) {
  db.prepare("DELETE FROM inquiries WHERE id = ?").run(inquiryId);
}

export const inquiryOwner = () => config().email.ownerEmail;
