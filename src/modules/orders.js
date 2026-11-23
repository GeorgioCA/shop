// Orders: server-side pricing, append-only snapshots, stock reservation and
// status transitions. The client cart is a wish list; this file decides money.

import crypto from "node:crypto";
import { db, insert, tx, jsonParse } from "../core/db.js";
import { config, taxRate } from "../core/config.js";
import { isEnabled } from "../core/modules.js";
import { loyaltySettings } from "./loyalty.js";
import { nowIso, str, int, paginate, money, randToken, localDateStr, zonedToUtc } from "../core/util.js";
import { getProduct } from "./catalog.js";
import { evaluateDiscount, useDiscount } from "./discounts.js";
import { upsertCustomer } from "./customers.js";
import { awardPoints, revokePointsForOrder } from "./loyalty.js";
import { helcimPaymentMatches, helcimTransaction } from "../core/payments.js";

export const ORDER_STATUSES = ["pending", "confirmed", "ready", "completed", "cancelled"];
export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];

/* --------------------------------- quote --------------------------------- */

export function quote({ items = [], fulfilment = "pickup", tipCents = 0, code = "", pointsToUse = 0, customer = null }) {
  const cfg = config();
  const clean = [];
  for (const raw of Array.isArray(items) ? items.slice(0, 50) : []) {
    const product = getProduct(raw?.id);
    if (!product || !product.active) return { ok: false, error: "One of the items is no longer available." };
    const qty = int(raw?.qty, { min: 1, max: 999, fallback: 1 });
    if (qty > product.max_per_order) return { ok: false, error: `Maximum ${product.max_per_order} of ${product.name} per order.` };
    if (product.sold_out) return { ok: false, error: `${product.name} is sold out.` };
    if (isEnabled("inventory") && product.track_stock && product.stock < qty) {
      return { ok: false, error: `Only ${product.stock} of ${product.name} left.` };
    }
    clean.push({
      product_id: product.id,
      sku: product.sku,
      name: product.variant_options && Object.keys(product.variant_options).length
        ? `${product.name} — ${Object.values(product.variant_options).join(", ")}`
        : product.name,
      unit_price_cents: product.price_now,
      qty,
      line_total_cents: product.price_now * qty,
      options: { track_stock: product.track_stock ? 1 : 0, attributes: product.attributes, variant: product.variant_options }
    });
  }
  if (!clean.length) return { ok: false, error: "Your cart is empty." };

  const merge = new Map();
  for (const line of clean) {
    const key = `${line.product_id}`;
    if (merge.has(key)) merge.get(key).qty += line.qty;
    else merge.set(key, line);
  }
  // Two lines of the same product merge into one; re-check the per-order cap
  // against the merged quantity, not each line in isolation.
  for (const line of merge.values()) {
    const product = getProduct(line.product_id);
    if (product && line.qty > product.max_per_order) {
      return { ok: false, error: `Maximum ${product.max_per_order} of ${product.name} per order.` };
    }
  }
  const lines = [...merge.values()].map((l) => ({ ...l, line_total_cents: l.unit_price_cents * l.qty }));

  const subtotal = lines.reduce((n, l) => n + l.line_total_cents, 0);
  if (cfg.commerce.minOrderCents > 0 && subtotal < cfg.commerce.minOrderCents) {
    return { ok: false, error: `The minimum order is ${money(cfg.commerce.minOrderCents, cfg.business.currency, cfg.business.locale)}.` };
  }

  let discountCents = 0;
  let discountCode = "";
  if (String(code || "").trim()) {
    const d = evaluateDiscount(code, subtotal);
    if (!d.ok) return { ok: false, error: d.error };
    discountCents = d.amountCents;
    discountCode = d.code;
  }

  let pointsUsed = 0;
  let pointsCents = 0;
  if (pointsToUse && customer && isEnabled("loyalty")) {
    // Both knobs come from the loyalty module config; without a cap a customer
    // could redeem against the whole subtotal regardless of the admin's limit.
    const { redeemCentsPer100, maxRedeemPercent } = loyaltySettings();
    const per100 = Math.max(1, Math.round(redeemCentsPer100 || 500));
    const available = db.prepare("SELECT COALESCE(SUM(points),0) AS n FROM loyalty_ledger WHERE customer_id = ?").get(customer.id).n;
    const cap = Math.floor(Math.max(0, subtotal - discountCents) * Math.min(100, Math.max(0, maxRedeemPercent)) / 100);
    pointsCents = Math.min(cap, Math.floor(Math.min(int(pointsToUse, { min: 0, fallback: 0 }), available) / 100) * per100);
    pointsUsed = Math.ceil(pointsCents / per100) * 100;
  }

  let deliveryCents = 0;
  let fulfilmentMode = fulfilment === "delivery" ? "delivery" : "pickup";
  if (fulfilmentMode === "delivery") {
    if (!isEnabled("delivery") || !cfg.commerce.deliveryEnabled) {
      return { ok: false, error: "Delivery is not available. Please choose pickup." };
    }
    const freeOver = cfg.commerce.deliveryFreeOverCents;
    deliveryCents = freeOver > 0 && subtotal >= freeOver ? 0 : cfg.commerce.deliveryFeeCents;
  }

  const taxableBase = Math.max(0, subtotal - discountCents - pointsCents + (cfg.commerce.taxDelivery ? deliveryCents : 0));
  const taxCents = Math.round(taxableBase * taxRate());
  const tip = cfg.commerce.tipsEnabled ? Math.min(Math.max(0, int(tipCents, { fallback: 0 })), 100_00) : 0;
  const total = Math.max(0, subtotal - discountCents - pointsCents + deliveryCents + taxCents + tip);

  return {
    ok: true,
    lines,
    subtotalCents: subtotal,
    discountCents,
    discountCode,
    pointsUsed,
    pointsCents,
    deliveryCents,
    taxCents,
    tipCents: tip,
    totalCents: total,
    fulfilment: fulfilmentMode
  };
}

/* ------------------------------- order numbers ---------------------------- */

function orderNumber() {
  const prefix = str(config().commerce.orderPrefix, 8) || "ORD-";
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  for (let i = 0; i < 50; i++) {
    const candidate = `${prefix}${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    if (!db.prepare("SELECT 1 FROM orders WHERE number = ?").get(candidate)) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

/* -------------------------------- creation -------------------------------- */

export function createOrder(input) {
  // Price the cart before any write: a failed quote must not touch customers.
  const q = quote({ ...input, customer: input.customer || null });
  if (!q.ok) throw new Error(q.error);
  const customer = input.customer || (input.email ? upsertCustomer({ email: input.email, name: input.name, phone: input.phone }) : null);

  const created = tx(() => {
    const number = orderNumber();
    const token = `ot_${randToken(12)}`;
    const info = insert("orders", {
      number,
      token,
      created_at: nowIso(),
      updated_at: nowIso(),
      customer_id: customer?.id ?? null,
      name: str(input.name, 120),
      email: str(input.email, 160).toLowerCase(),
      phone: str(input.phone, 40),
      fulfilment: q.fulfilment,
      address: str(input.address, 400),
      notes: str(input.notes, 1000),
      admin_notes: "",
      payment_method: ["stripe", "helcim"].includes(input.payment_method) ? input.payment_method : "offline",
      payment_status: input.paid ? "paid" : "unpaid",
      status: input.paid ? "confirmed" : "pending",
      subtotal_cents: q.subtotalCents,
      discount_cents: q.discountCents,
      discount_code: q.discountCode,
      delivery_cents: q.deliveryCents,
      tax_cents: q.taxCents,
      tip_cents: q.tipCents,
      total_cents: q.totalCents,
      currency: config().business.currency,
      stripe_session: input.stripe_session || null,
      paid_at: input.paid ? nowIso() : null
    });
    const orderId = Number(info.lastInsertRowid);
    for (const line of q.lines) {
      insert("order_items", {
        order_id: orderId,
        product_id: line.product_id,
        sku: line.sku,
        name: line.name,
        unit_price_cents: line.unit_price_cents,
        qty: line.qty,
        line_total_cents: line.line_total_cents,
        options: JSON.stringify(line.options)
      });
    }
    if (q.discountCode) useDiscount(q.discountCode);
    if (q.pointsUsed > 0 && customer) {
      insert("loyalty_ledger", {
        customer_id: customer.id, points: -q.pointsUsed, reason: "Redeemed at checkout", order_id: orderId, created_at: nowIso()
      });
    }
    reserveStock(q.lines);
    if (input.paid && customer) awardPoints(customer.id, q.totalCents, orderId);
    return { id: orderId, number, token };
  });

  return getOrder(created.number);
}

export function reserveStock(lines) {
  if (!isEnabled("inventory")) return;
  for (const line of lines) {
    if (!line.options?.track_stock) continue;
    db.prepare("UPDATE products SET stock = MAX(0, stock - ?), sold_out = CASE WHEN MAX(0, stock - ?) = 0 THEN 1 ELSE sold_out END WHERE id = ?")
      .run(line.qty, line.qty, line.product_id);
  }
}

export function releaseStock(orderId) {
  if (!isEnabled("inventory")) return;
  const items = orderItems(orderId);
  for (const item of items) {
    const opts = jsonParse(item.options, {});
    if (!opts.track_stock) continue;
    db.prepare("UPDATE products SET stock = stock + ?, sold_out = 0 WHERE id = ?").run(item.qty, item.product_id);
  }
}

/* --------------------------------- reads ---------------------------------- */

export function getOrder(identifier) {
  if (identifier === undefined || identifier === null || identifier === "") return null;
  const asId = Number(identifier);
  const row = Number.isInteger(asId) && String(asId) === String(identifier)
    ? db.prepare("SELECT * FROM orders WHERE id = ?").get(asId)
    : db.prepare("SELECT * FROM orders WHERE number = ? OR token = ?").get(String(identifier), String(identifier));
  if (!row) return null;
  return { ...row, items: orderItems(row.id) };
}

// Public pages are capability URLs. Only the token may fetch an order there —
// numbers are short and date-stamped, and must never be a public lookup key.
export function getOrderByToken(token) {
  const row = token ? db.prepare("SELECT * FROM orders WHERE token = ?").get(String(token)) : null;
  return row ? { ...row, items: orderItems(row.id) } : null;
}

export function orderItems(orderId) {
  return db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId);
}

export function listOrders({ status = "", payment = "", search = "", from = "", to = "", page = 1, perPage = 25 } = {}) {
  const where = [];
  const params = [];
  if (status && status !== "all") { where.push("status = ?"); params.push(status); }
  if (payment && payment !== "all") { where.push("payment_status = ?"); params.push(payment); }
  if (from) { where.push("created_at >= ?"); params.push(from); }
  if (to) { where.push("created_at <= ?"); params.push(to); }
  if (search) { where.push("(number LIKE ? OR name LIKE ? OR email LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders ${clause}`).get(...params).n;
  const pager = paginate(total, page, perPage);
  const rows = db.prepare(`SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pager.perPage, pager.offset);
  return { rows, pager };
}

export function recentOrders(limit = 6) {
  return db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function setOrderStatus(orderId, status) {
  if (!ORDER_STATUSES.includes(status)) throw new Error("Unknown order status.");
  const order = getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  if (order.status === "cancelled" && status !== "cancelled") throw new Error("A cancelled order cannot be reopened.");
  if (status === "cancelled" && order.status !== "cancelled") releaseStock(order.id);
  db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), order.id);
  return getOrder(order.id);
}

export function markPaid(orderId, { stripeSession = null, reference = null } = {}) {
  const order = getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  if (order.payment_status === "paid") return order;
  // A cancelled order can still be paid (late webhook, pay-at-door after
  // cancellation); money arrived, so it becomes confirmed rather than staying cancelled.
  db.prepare(
    "UPDATE orders SET payment_status = 'paid', paid_at = ?, status = CASE WHEN status IN ('pending','cancelled') THEN 'confirmed' ELSE status END, stripe_session = COALESCE(?, stripe_session), payment_reference = COALESCE(?, payment_reference), updated_at = ? WHERE id = ?"
  ).run(nowIso(), stripeSession, reference, nowIso(), order.id);
  if (order.customer_id) awardPoints(order.customer_id, order.total_cents, order.id);
  return getOrder(order.id);
}

export function markRefunded(orderId) {
  const order = getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  db.prepare("UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ?").run(nowIso(), orderId);
  // Points earned on a refunded order are taken back off the ledger.
  revokePointsForOrder(orderId);
}

export function setOrderNotes(orderId, { admin_notes }) {
  db.prepare("UPDATE orders SET admin_notes = ?, updated_at = ? WHERE id = ?").run(str(admin_notes, 4000), nowIso(), orderId);
}

/**
 * Webhook-driven Helcim confirmation. The cardTransaction event carries only
 * a transaction id; the authoritative record is read back from Helcim and
 * bound to the order through the invoice number recorded at checkout.
 * markPaid is idempotent, so Helcim's retry schedule is safe.
 */
export async function confirmHelcimTransaction(transactionId) {
  const transaction = await helcimTransaction(transactionId);
  if (String(transaction?.status).toUpperCase() !== "APPROVED") return null;
  const order = transaction?.invoiceNumber ? getOrder(transaction.invoiceNumber) : null;
  if (!order || order.payment_method !== "helcim") return null;
  if (!helcimPaymentMatches(order, transaction)) {
    console.error(`[helcim] webhook mismatch for ${order.number}: transaction ${transactionId}`);
    return null;
  }
  if (order.payment_status === "paid") return getOrder(order.id);
  const paid = markPaid(order.id, { reference: String(transaction.transactionId) });
  return paid;
}

export function expireStalePending(days = 2) {  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const stale = db.prepare(
    "SELECT * FROM orders WHERE status = 'pending' AND payment_status = 'unpaid' AND payment_method IN ('stripe','helcim') AND created_at < ?"
  ).all(cutoff);
  for (const order of stale) setOrderStatus(order.id, "cancelled");
  return stale.length;
}

/* --------------------------------- stats ---------------------------------- */

export function orderStats() {
  // Day-based counts use the business's local day, not the server's UTC day.
  const tz = config().business.timezone;
  const today = localDateStr(new Date(), tz);
  const [y, m, d] = today.split("-").map(Number);
  const dayStart = zonedToUtc(y, m, d, 0, 0, tz).toISOString();
  const dayEnd = zonedToUtc(y, m, d, 23, 59, 59, tz).toISOString();
  return {
    today: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE created_at >= ? AND created_at <= ?").get(dayStart, dayEnd).n,
    pending: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending' AND payment_status != 'paid'").get().n,
    open: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending','confirmed','ready')").get().n,
    revenue30: db.prepare(
      "SELECT COALESCE(SUM(total_cents),0) AS n FROM orders WHERE payment_status = 'paid' AND created_at >= ?"
    ).get(new Date(Date.now() - 30 * 86400_000).toISOString()).n,
    revenueToday: db.prepare(
      "SELECT COALESCE(SUM(total_cents),0) AS n FROM orders WHERE payment_status = 'paid' AND created_at >= ? AND created_at <= ?"
    ).get(dayStart, dayEnd).n,
    allTime: db.prepare("SELECT COALESCE(SUM(total_cents),0) AS n FROM orders WHERE payment_status = 'paid'").get().n
  };
}

export function topProducts(limit = 5) {
  return db.prepare(`
    SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.line_total_cents) AS cents
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status = 'paid'
    GROUP BY oi.name ORDER BY qty DESC LIMIT ?`).all(limit);
}
