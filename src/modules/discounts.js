// Discount codes. One evaluator decides usability; the checkout preview and
// order creation both call it, so they cannot disagree.

import { db, insert } from "../core/db.js";
import { nowIso, str, int, parseCents, bool, id, money } from "../core/util.js";
import { config } from "../core/config.js";

export function listDiscounts() {
  return db.prepare("SELECT * FROM discounts ORDER BY created_at DESC").all();
}

export function getDiscount(code) {
  return db.prepare("SELECT * FROM discounts WHERE upper(code) = upper(?)").get(str(code, 40)) || null;
}

export function evaluateDiscount(code, subtotalCents, { email = "" } = {}) {
  const clean = str(code, 40).trim().toUpperCase();
  if (!clean) return { ok: false, error: "Enter a code." };
  const d = getDiscount(clean);
  if (!d) return { ok: false, error: "That code is not valid." };
  if (!d.active) return { ok: false, error: "That code is no longer active." };
  const now = nowIso();
  if (d.starts_at && d.starts_at > now) return { ok: false, error: "That code is not active yet." };
  if (d.expires_at && d.expires_at < now) return { ok: false, error: "That code has expired." };
  if (d.max_uses !== null && d.max_uses !== undefined && d.uses >= d.max_uses) {
    return { ok: false, error: "That code has reached its limit." };
  }
  if (subtotalCents < d.min_subtotal_cents) {
    return { ok: false, error: `Spend ${money(d.min_subtotal_cents, config().business.currency, config().business.locale)} to use this code.` };
  }
  const raw = d.kind === "percent" ? Math.round((subtotalCents * Math.min(100, d.value)) / 100) : d.value;
  const amount = Math.max(0, Math.min(subtotalCents, raw));
  if (amount <= 0) return { ok: false, error: "That code does not apply to this order." };
  return { ok: true, code: d.code, amountCents: amount, kind: d.kind, value: d.value };
}

export function saveDiscount(input) {
  const code = str(input.code, 40).trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) throw new Error("Use 2–40 letters, numbers, dashes or underscores.");
  const kind = input.kind === "fixed" ? "fixed" : "percent";
  const value = kind === "percent"
    ? int(input.value, { min: 1, max: 100, fallback: 10 })
    : (parseCents(input.value) ?? 0);
  if (kind === "fixed" && value <= 0) throw new Error("Enter an amount above zero.");
  const existing = getDiscount(code);
  const row = {
    code,
    kind,
    value,
    min_subtotal_cents: parseCents(input.min_subtotal) ?? 0,
    max_uses: input.max_uses ? int(input.max_uses, { min: 1, max: 1_000_000, fallback: null }) : null,
    starts_at: input.starts_at ? new Date(input.starts_at).toISOString() : null,
    expires_at: input.expires_at ? new Date(input.expires_at).toISOString() : null,
    active: bool(input.active ?? 1) ? 1 : 0
  };
  if (existing) {
    const keys = Object.keys(row).filter((k) => k !== "code");
    db.prepare(`UPDATE discounts SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => row[k]), existing.id);
    return getDiscount(code);
  }
  const newId = id("d_");
  insert("discounts", { id: newId, ...row, uses: 0, created_at: nowIso() });
  return getDiscount(code);
}

export function useDiscount(code) {
  db.prepare("UPDATE discounts SET uses = uses + 1 WHERE upper(code) = upper(?)").run(code);
}

export function toggleDiscount(discountId, active) {
  db.prepare("UPDATE discounts SET active = ? WHERE id = ?").run(active ? 1 : 0, discountId);
}

export function deleteDiscount(discountId) {
  db.prepare("DELETE FROM discounts WHERE id = ?").run(discountId);
}
