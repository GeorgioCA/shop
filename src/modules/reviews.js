// Reviews. Submitted publicly as pending; only approved reviews are shown.

import { db, insert } from "../core/db.js";
import { id, nowIso, str, int, emailOk } from "../core/util.js";

export function createReview(input) {
  const name = str(input.customer_name, 120);
  const body = str(input.body, 3000);
  if (name.length < 2) throw new Error("Enter your name.");
  if (body.length < 5) throw new Error("Write a little more.");
  if (input.email && !emailOk(input.email)) throw new Error("Enter a valid email address.");
  const reviewId = id("rv_");
  insert("reviews", {
    id: reviewId,
    product_id: input.product_id || null,
    service_id: input.service_id || null,
    customer_name: name,
    email: str(input.email, 160).toLowerCase(),
    rating: int(input.rating, { min: 1, max: 5, fallback: 5 }),
    title: str(input.title, 140),
    body,
    status: "pending",
    created_at: nowIso()
  });
  return db.prepare("SELECT * FROM reviews WHERE id = ?").get(reviewId);
}

export function listReviews({ status = "", limit = 200 } = {}) {
  const where = status && status !== "all" ? "WHERE status = ?" : "";
  const params = where ? [status] : [];
  return db.prepare(`SELECT * FROM reviews ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit);
}

export function approvedReviews(productId, limit = 8) {
  return db.prepare("SELECT * FROM reviews WHERE status = 'approved' AND product_id = ? ORDER BY created_at DESC LIMIT ?").all(productId, limit);
}

export function reviewSummary(productId) {
  const row = db.prepare(
    "SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE status = 'approved' AND product_id = ?"
  ).get(productId);
  return { count: row.n, average: row.avg ? Math.round(row.avg * 10) / 10 : 0 };
}

export function setReviewStatus(reviewId, status) {
  if (!["pending", "approved", "rejected"].includes(status)) throw new Error("Unknown review status.");
  db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(status, reviewId);
}

export function deleteReview(reviewId) {
  db.prepare("DELETE FROM reviews WHERE id = ?").run(reviewId);
}

export function reviewStats() {
  return db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM reviews`).get();
}
