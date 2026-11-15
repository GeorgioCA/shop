// Service catalog: what a business sells that is delivered over time rather
// than shipped. Pricing can be fixed, "from", or quote-only.

import { db, jsonParse, insert, update } from "../core/db.js";
import { id, nowIso, uniqueSlug, str, int, bool, parseCents, oneLine } from "../core/util.js";
import { parsePairs } from "./catalog.js";

export function listServices({ activeOnly = false, featured = false, limit = 0, search = "" } = {}) {
  const where = [];
  const params = [];
  if (activeOnly) where.push("active = 1");
  if (featured) where.push("featured = 1");
  if (search) { where.push("(name LIKE ? OR short_desc LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  const sql = `SELECT * FROM services ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sort, name${limit ? " LIMIT ?" : ""}`;
  if (limit) params.push(Number(limit));
  return db.prepare(sql).all(...params).map(hydrateService);
}

export function hydrateService(row) {
  if (!row) return null;
  return { ...row, attributes: jsonParse(row.attributes, {}) };
}

export function getService(identifier) {
  const row = db.prepare("SELECT * FROM services WHERE id = ? OR slug = ?").get(String(identifier || ""), String(identifier || ""));
  return hydrateService(row);
}

export function saveService(input) {
  const existing = input.id ? getService(input.id) : null;
  const name = oneLine(input.name, 140);
  if (!name) throw new Error("Give the service a name.");
  const priceCents = parseCents(input.price) ?? 0;
  if (priceCents < 0) throw new Error("Price cannot be negative.");
  const priceType = ["fixed", "from", "quote"].includes(input.price_type) ? input.price_type : "fixed";
  const slugTaken = (slug) => !!db.prepare("SELECT 1 FROM services WHERE slug = ? AND id != ?").get(slug, existing?.id || "");
  const slug = existing && existing.name === name ? existing.slug : uniqueSlug(input.slug || name, slugTaken);

  const row = {
    sku: oneLine(input.sku, 40) || existing?.sku || "",
    slug,
    name,
    short_desc: str(input.short_desc, 400),
    description: str(input.description, 12000),
    category_id: input.category_id || null,
    duration_min: int(input.duration_min, { min: 5, max: 1440, fallback: 60 }),
    buffer_min: int(input.buffer_min, { min: 0, max: 240, fallback: 0 }),
    price_cents: priceCents,
    price_type: priceType,
    capacity: int(input.capacity, { min: 1, max: 100, fallback: 1 }),
    active: bool(input.active ?? 1) ? 1 : 0,
    featured: bool(input.featured ?? 1) ? 1 : 0,
    image: str(input.image, 300) || null,
    attributes: JSON.stringify(parsePairs(input.attributes)),
    sort: int(input.sort, { min: 0, max: 99999, fallback: 100 }),
    updated_at: nowIso()
  };
  if (existing) {
    update("services", existing.id, row);
    return getService(existing.id);
  }
  const newId = id("svc_");
  insert("services", { id: newId, ...row, created_at: nowIso() });
  return getService(newId);
}

export function deleteService(serviceId) {
  const upcoming = db.prepare(
    "SELECT COUNT(*) AS n FROM bookings WHERE service_id = ? AND status IN ('pending','confirmed') AND starts_at > ?"
  ).get(serviceId, nowIso()).n;
  if (upcoming) throw new Error(`This service has ${upcoming} upcoming booking(s). Cancel or complete them first.`);
  db.prepare("DELETE FROM services WHERE id = ?").run(serviceId);
}

export function toggleServiceFlag(serviceId, flag, value) {
  if (!["active", "featured"].includes(flag)) throw new Error("Unknown flag.");
  db.prepare(`UPDATE services SET ${flag} = ?, updated_at = ? WHERE id = ?`).run(value ? 1 : 0, nowIso(), serviceId);
}

export function serviceStats() {
  return db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active FROM services`).get();
}

export function listStaff({ activeOnly = false } = {}) {
  return db.prepare(`SELECT * FROM staff ${activeOnly ? "WHERE active = 1" : ""} ORDER BY sort, name`).all();
}

export function saveStaff(input) {
  const name = oneLine(input.name, 120);
  if (!name) throw new Error("Give the staff member a name.");
  const row = {
    name,
    title: str(input.title, 80),
    email: str(input.email, 160),
    phone: str(input.phone, 40),
    active: bool(input.active ?? 1) ? 1 : 0,
    sort: int(input.sort, { fallback: 100 })
  };
  if (input.id) { update("staff", input.id, row); return input.id; }
  const newId = id("st_");
  insert("staff", { id: newId, ...row, created_at: nowIso() });
  return newId;
}

export function deleteStaff(staffId) {
  db.prepare("UPDATE bookings SET staff_id = NULL WHERE staff_id = ?").run(staffId);
  db.prepare("DELETE FROM staff WHERE id = ?").run(staffId);
}

export function servicePriceLabel(service) {
  if (!service) return "";
  if (service.price_type === "quote") return "Quote";
  return service.price_type === "from" ? `From ${service.price_cents / 100}` : "";
}
