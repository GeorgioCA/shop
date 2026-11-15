// Product catalog data access + validation. Products are data, never code.

import { db, jsonParse, insert, update } from "../core/db.js";
import { config } from "../core/config.js";
import { id, nowIso, slugify, uniqueSlug, str, int, bool, parseCents, oneLine } from "../core/util.js";

/* ------------------------------- categories ------------------------------- */

export function listCategories(kind = "product", { activeOnly = false } = {}) {
  const sql = `SELECT * FROM categories WHERE kind = ? ${activeOnly ? "AND active = 1" : ""} ORDER BY sort, name`;
  return db.prepare(sql).all(kind);
}

export function getCategory(categoryId) {
  return db.prepare("SELECT * FROM categories WHERE id = ?").get(String(categoryId || "")) || null;
}

export function saveCategory(input) {
  const kind = input.kind === "service" ? "service" : "product";
  const existing = input.id ? getCategory(input.id) : null;
  const name = str(input.name, 120);
  if (!name) throw new Error("Give the category a name.");
  const slugTaken = (slug) =>
    !!db.prepare("SELECT 1 FROM categories WHERE kind = ? AND slug = ? AND id != ?").get(kind, slug, existing?.id || "");
  const slug = existing && existing.name === name ? existing.slug : uniqueSlug(input.slug || name, slugTaken);
  const row = {
    kind,
    name,
    slug,
    description: str(input.description, 1000),
    parent_id: input.parent_id || null,
    image: str(input.image, 300) || null,
    sort: int(input.sort, { min: 0, max: 9999, fallback: 100 }),
    active: bool(input.active ?? 1) ? 1 : 0
  };
  if (existing) {
    update("categories", existing.id, row);
    return getCategory(existing.id);
  }
  const newId = id("cat_");
  insert("categories", { id: newId, ...row });
  return getCategory(newId);
}

export function deleteCategory(categoryId) {
  const used = db.prepare("SELECT COUNT(*) AS n FROM products WHERE category_id = ?").get(categoryId).n;
  const usedSvc = db.prepare("SELECT COUNT(*) AS n FROM services WHERE category_id = ?").get(categoryId).n;
  if (used + usedSvc > 0) throw new Error(`Move the ${used + usedSvc} item(s) in this category first.`);
  db.prepare("DELETE FROM categories WHERE id = ?").run(categoryId);
}

/* -------------------------------- products -------------------------------- */

const PRODUCT_SORTS = {
  manual: "sort ASC, name ASC",
  name: "name ASC",
  price_asc: "price_cents ASC, name ASC",
  price_desc: "price_cents DESC, name ASC",
  newest: "created_at DESC"
};

export function listProducts({
  activeOnly = false, categoryId = "", featured = false, search = "", limit = 0, sort = "manual", includeSoldOut = true
} = {}) {
  const where = [];
  const params = [];
  if (activeOnly) where.push("active = 1");
  if (categoryId) { where.push("category_id = ?"); params.push(categoryId); }
  if (featured) where.push("featured = 1");
  if (!includeSoldOut) where.push("sold_out = 0");
  if (search) { where.push("(name LIKE ? OR sku LIKE ? OR short_desc LIKE ?)"); const q = `%${search}%`; params.push(q, q, q); }
  const sql = `SELECT * FROM products ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${PRODUCT_SORTS[sort] || PRODUCT_SORTS.manual}${limit ? " LIMIT ?" : ""}`;
  if (limit) params.push(Number(limit));
  return db.prepare(sql).all(...params).map(hydrateProduct);
}

export function getProduct(identifier) {
  const row = db.prepare("SELECT * FROM products WHERE id = ? OR slug = ?").get(String(identifier || ""), String(identifier || ""));
  return row ? hydrateProduct(row) : null;
}

export function hydrateProduct(row) {
  if (!row) return null;
  return {
    ...row,
    gallery: jsonParse(row.gallery, []),
    attributes: jsonParse(row.attributes, {}),
    variant_options: jsonParse(row.variant_options, {}),
    on_sale: Number.isInteger(row.sale_price_cents) && row.sale_price_cents > 0 && row.sale_price_cents < row.price_cents,
    price_now: Number.isInteger(row.sale_price_cents) && row.sale_price_cents > 0 && row.sale_price_cents < row.price_cents ? row.sale_price_cents : row.price_cents
  };
}

const ATTRIBUTE_SKIP = new Set(["active", "featured", "sold_out"]);

export function saveProduct(input) {
  const existing = input.id ? getProduct(input.id) : null;
  const name = oneLine(input.name, 140);
  if (!name) throw new Error("Give the product a name.");

  const priceCents = parseCents(input.price);
  if (priceCents === null || priceCents < 0) throw new Error("Enter a price (0 is allowed for free items).");
  const saleCents = parseCents(input.sale_price);
  if (saleCents !== null && saleCents >= priceCents) throw new Error("The sale price must be below the regular price.");
  if (saleCents !== null && saleCents <= 0) throw new Error("Leave the sale price empty to end a sale.");

  const slugTaken = (slug) => !!db.prepare("SELECT 1 FROM products WHERE slug = ? AND id != ?").get(slug, existing?.id || "");
  const slug = existing && existing.name === name ? existing.slug : uniqueSlug(input.slug || name, slugTaken);

  const attributes = parsePairs(input.attributes);
  const gallery = String(input.gallery || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const variantOptions = parsePairs(input.variant_options);

  const row = {
    sku: oneLine(input.sku, 40) || existing?.sku || suggestSku(name),
    slug,
    name,
    short_desc: str(input.short_desc, 400),
    description: str(input.description, 12000),
    category_id: input.category_id || null,
    price_cents: priceCents,
    sale_price_cents: saleCents,
    cost_cents: parseCents(input.cost) ?? 0,
    taxable: bool(input.taxable ?? 1) ? 1 : 0,
    track_stock: bool(input.track_stock) ? 1 : 0,
    stock: int(input.stock, { min: 0, max: 1_000_000, fallback: 0 }),
    sold_out: bool(input.sold_out) ? 1 : 0,
    max_per_order: int(input.max_per_order, { min: 1, max: 999, fallback: 10 }),
    featured: bool(input.featured) ? 1 : 0,
    active: bool(input.active ?? 1) ? 1 : 0,
    image: str(input.image, 300) || null,
    gallery: JSON.stringify(gallery),
    attributes: JSON.stringify(attributes),
    variant_group: oneLine(input.variant_group, 80),
    variant_options: JSON.stringify(variantOptions),
    sort: int(input.sort, { min: 0, max: 99999, fallback: 100 }),
    updated_at: nowIso()
  };

  // An SKU has to be unique so labels and exports stay unambiguous.
  const skuClash = db.prepare("SELECT 1 FROM products WHERE sku = ? AND sku != '' AND id != ?").get(row.sku, existing?.id || "");
  if (skuClash) throw new Error("That SKU is already used by another product.");

  if (existing) {
    update("products", existing.id, row);
    return getProduct(existing.id);
  }
  const newId = id("p_");
  insert("products", { id: newId, ...row, created_at: nowIso() });
  return getProduct(newId);
}

export function suggestSku(name) {
  const base = String(name || "item").replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "ITM";
  for (let i = 0; i < 50; i++) {
    const candidate = `SKU-${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    if (!db.prepare("SELECT 1 FROM products WHERE sku = ?").get(candidate)) return candidate;
  }
  return `SKU-${Date.now().toString(36).toUpperCase()}`;
}

export function deleteProduct(productId) {
  const p = getProduct(productId);
  if (!p) throw new Error("Product not found.");
  // Order lines snapshot name and price, so history survives this.
  db.prepare("DELETE FROM products WHERE id = ?").run(p.id);
  db.prepare("DELETE FROM reviews WHERE product_id = ?").run(p.id);
}

export function toggleProductFlag(productId, flag, value) {
  if (!["active", "featured", "sold_out"].includes(flag)) throw new Error("Unknown flag.");
  db.prepare(`UPDATE products SET ${flag} = ?, updated_at = ? WHERE id = ?`).run(value ? 1 : 0, nowIso(), productId);
}

export function adjustStock(productId, delta) {
  db.prepare("UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?").run(Number(delta) || 0, productId);
  const p = getProduct(productId);
  if (p && p.track_stock && p.stock === 0 && !p.sold_out) {
    db.prepare("UPDATE products SET sold_out = 1 WHERE id = ?").run(productId);
  }
  return getProduct(productId);
}

export function lowStock(threshold = null) {
  const t = threshold ?? config().catalog.lowStockThreshold;
  return db.prepare("SELECT * FROM products WHERE active = 1 AND track_stock = 1 AND stock <= ? ORDER BY stock ASC LIMIT 20").all(t).map(hydrateProduct);
}

export function productStats() {
  return db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN featured = 1 AND active = 1 THEN 1 ELSE 0 END) AS featured,
      SUM(CASE WHEN track_stock = 1 AND stock <= 0 THEN 1 ELSE 0 END) AS out_of_stock
    FROM products`).get();
}

/* -------------------------------- helpers -------------------------------- */

// "Label | Value" per line -> { Label: Value }. Also accepts "Label: Value".
export function parsePairs(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = /^([^:|]{1,60})\s*[|:]\s*(.+)$/.exec(trimmed);
    if (!m) { out[trimmed.slice(0, 60)] = ""; continue; }
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

export const pairsToText = (obj) =>
  Object.entries(obj || {}).map(([k, v]) => (v === "" ? k : `${k} | ${v}`)).join("\n");

export function groupVariants(products) {
  const groups = new Map();
  for (const p of products) {
    if (!p.variant_group) continue;
    if (!groups.has(p.variant_group)) groups.set(p.variant_group, []);
    groups.get(p.variant_group).push(p);
  }
  return groups;
}

export { PRODUCT_SORTS, ATTRIBUTE_SKIP };
