import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { nowIso } from "./util.js";

const DATA_DIR = process.env.DATA_DIR || "./data";
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const dbPath = path.join(DATA_DIR, "store.db");
export const db = new DatabaseSync(dbPath);

const SCHEMA_VERSION = 1;

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'staff',
    active          INTEGER NOT NULL DEFAULT 1,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    last_login_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS modules (
    key        TEXT PRIMARY KEY,
    enabled    INTEGER NOT NULL DEFAULT 0,
    config     TEXT NOT NULL DEFAULT '{}',
    sort       INTEGER NOT NULL DEFAULT 100,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id            TEXT PRIMARY KEY,
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    mime          TEXT NOT NULL,
    size          INTEGER NOT NULL DEFAULT 0,
    width         INTEGER,
    height        INTEGER,
    alt           TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL DEFAULT 'product',
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    parent_id   TEXT,
    image       TEXT,
    sort        INTEGER NOT NULL DEFAULT 100,
    active      INTEGER NOT NULL DEFAULT 1,
    UNIQUE (kind, slug)
  );

  CREATE TABLE IF NOT EXISTS products (
    id               TEXT PRIMARY KEY,
    sku              TEXT NOT NULL DEFAULT '',
    slug             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    short_desc       TEXT NOT NULL DEFAULT '',
    description      TEXT NOT NULL DEFAULT '',
    category_id      TEXT,
    price_cents      INTEGER NOT NULL DEFAULT 0,
    sale_price_cents INTEGER,
    cost_cents       INTEGER NOT NULL DEFAULT 0,
    taxable          INTEGER NOT NULL DEFAULT 1,
    track_stock      INTEGER NOT NULL DEFAULT 0,
    stock            INTEGER NOT NULL DEFAULT 0,
    sold_out         INTEGER NOT NULL DEFAULT 0,
    max_per_order    INTEGER NOT NULL DEFAULT 10,
    featured         INTEGER NOT NULL DEFAULT 0,
    active           INTEGER NOT NULL DEFAULT 1,
    image            TEXT,
    gallery          TEXT NOT NULL DEFAULT '[]',
    attributes       TEXT NOT NULL DEFAULT '{}',
    variant_group    TEXT NOT NULL DEFAULT '',
    variant_options  TEXT NOT NULL DEFAULT '{}',
    sort             INTEGER NOT NULL DEFAULT 100,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS services (
    id           TEXT PRIMARY KEY,
    sku          TEXT NOT NULL DEFAULT '',
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    short_desc   TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    category_id  TEXT,
    duration_min INTEGER NOT NULL DEFAULT 60,
    buffer_min   INTEGER NOT NULL DEFAULT 0,
    price_cents  INTEGER NOT NULL DEFAULT 0,
    price_type   TEXT NOT NULL DEFAULT 'fixed',
    capacity     INTEGER NOT NULL DEFAULT 1,
    active       INTEGER NOT NULL DEFAULT 1,
    featured     INTEGER NOT NULL DEFAULT 1,
    image        TEXT,
    attributes   TEXT NOT NULL DEFAULT '{}',
    sort         INTEGER NOT NULL DEFAULT 100,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL DEFAULT '',
    phone      TEXT NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    sort       INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    marketing     INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    points        INTEGER NOT NULL DEFAULT 0,
    session_version INTEGER NOT NULL DEFAULT 1,
    verification_token   TEXT,
    verification_expires TEXT,
    pending_password_hash TEXT,
    created_at    TEXT NOT NULL,
    last_seen_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    number          TEXT NOT NULL UNIQUE,
    token           TEXT NOT NULL UNIQUE,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    customer_id     INTEGER REFERENCES customers(id),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT NOT NULL DEFAULT '',
    fulfilment      TEXT NOT NULL DEFAULT 'pickup',
    address         TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    admin_notes     TEXT NOT NULL DEFAULT '',
    payment_method  TEXT NOT NULL DEFAULT 'offline',
    payment_status  TEXT NOT NULL DEFAULT 'unpaid',
    status          TEXT NOT NULL DEFAULT 'pending',
    subtotal_cents  INTEGER NOT NULL DEFAULT 0,
    discount_cents  INTEGER NOT NULL DEFAULT 0,
    discount_code   TEXT NOT NULL DEFAULT '',
    delivery_cents  INTEGER NOT NULL DEFAULT 0,
    tax_cents       INTEGER NOT NULL DEFAULT 0,
    tip_cents       INTEGER NOT NULL DEFAULT 0,
    total_cents     INTEGER NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'CAD',
    stripe_session  TEXT,
    paid_at         TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id       TEXT NOT NULL DEFAULT '',
    sku              TEXT NOT NULL DEFAULT '',
    name             TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL DEFAULT 0,
    qty              INTEGER NOT NULL DEFAULT 1,
    line_total_cents INTEGER NOT NULL DEFAULT 0,
    options          TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    number      TEXT NOT NULL UNIQUE,
    token       TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    service_id  TEXT NOT NULL DEFAULT '',
    service_name TEXT NOT NULL DEFAULT '',
    staff_id    TEXT,
    customer_id INTEGER REFERENCES customers(id),
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    phone       TEXT NOT NULL DEFAULT '',
    starts_at   TEXT NOT NULL,
    ends_at     TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending',
    notes       TEXT NOT NULL DEFAULT '',
    admin_notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS closures (
    id         TEXT PRIMARY KEY,
    starts_at  TEXT NOT NULL,
    ends_at    TEXT NOT NULL,
    reason     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pages (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    seo_title       TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    seo_image       TEXT,
    sections        TEXT NOT NULL DEFAULT '[]',
    is_home         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nav_items (
    id        TEXT PRIMARY KEY,
    location  TEXT NOT NULL DEFAULT 'header',
    label     TEXT NOT NULL,
    url       TEXT NOT NULL,
    sort      INTEGER NOT NULL DEFAULT 100,
    visible   INTEGER NOT NULL DEFAULT 1,
    parent_id TEXT
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id       TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer   TEXT NOT NULL,
    sort     INTEGER NOT NULL DEFAULT 100,
    active   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id      TEXT PRIMARY KEY,
    author  TEXT NOT NULL,
    role    TEXT NOT NULL DEFAULT '',
    quote   TEXT NOT NULL,
    rating  INTEGER NOT NULL DEFAULT 5,
    image   TEXT,
    sort    INTEGER NOT NULL DEFAULT 100,
    active  INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    number     TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    subject    TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'contact',
    status     TEXT NOT NULL DEFAULT 'new',
    notes      TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS discounts (
    id                 TEXT PRIMARY KEY,
    code               TEXT NOT NULL UNIQUE,
    kind               TEXT NOT NULL DEFAULT 'percent',
    value              INTEGER NOT NULL DEFAULT 0,
    min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
    max_uses           INTEGER,
    uses               INTEGER NOT NULL DEFAULT 0,
    starts_at          TEXT,
    expires_at         TEXT,
    active             INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id             TEXT PRIMARY KEY,
    product_id     TEXT,
    service_id     TEXT,
    customer_name  TEXT NOT NULL,
    email          TEXT NOT NULL DEFAULT '',
    rating         INTEGER NOT NULL DEFAULT 5,
    title          TEXT NOT NULL DEFAULT '',
    body           TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending',
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loyalty_ledger (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    points      INTEGER NOT NULL,
    reason      TEXT NOT NULL DEFAULT '',
    order_id    INTEGER,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS newsletter (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name            TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT 'site',
    created_at      TEXT NOT NULL,
    unsubscribed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS email_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    template   TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'sent',
    error      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    user_email TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL DEFAULT '',
    entity_id  TEXT NOT NULL DEFAULT '',
    detail     TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id, sort);
  CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, sort);
  CREATE INDEX IF NOT EXISTS idx_services_active ON services(active, sort);
  CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(starts_at);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
  CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_ledger(customer_id);
`);

/* Forward-only migrations. `PRAGMA user_version` is the release marker; each
   block must be safe to run against a database that already has the column. */
const currentVersion = db.prepare("PRAGMA user_version").get().user_version ?? 0;

function columns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function addColumn(table, name, ddl) {
  if (!columns(table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

if (currentVersion < 1) {
  // v1 is the initial platform schema. Future releases add guarded ALTERs here.
  db.exec("PRAGMA user_version = 1");
}

if (currentVersion < 2) {
  // v2: customer sessions are revocable and accounts require email verification.
  addColumn("customers", "session_version", "INTEGER NOT NULL DEFAULT 1");
  addColumn("customers", "verification_token", "TEXT");
  addColumn("customers", "verification_expires", "TEXT");
  addColumn("customers", "pending_password_hash", "TEXT");
  db.exec("PRAGMA user_version = 2");
}

export const schemaVersion = () => db.prepare("PRAGMA user_version").get().user_version;

/* ------------------------------ transactions ----------------------------- */

// "IMMEDIATE" takes the SQLite write lock up front, so a check-then-write
// sequence inside the callback cannot interleave with another writer. Use it
// wherever a transaction re-validates state that was read outside (e.g. booking slots).
export function tx(fn, mode = "DEFERRED") {
  db.exec(`BEGIN ${mode === "IMMEDIATE" ? "IMMEDIATE" : "DEFERRED"}`);
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
    throw err;
  }
}

export const jsonParse = (text, fallback) => {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

// Table/row helpers build SQL from identifiers. Callers are internal, but the
// identifiers are validated so a future caller can never pass user data here.
const IDENT = /^[a-z_][a-z0-9_]*$/;

export const insert = (table, row) => {
  const keys = Object.keys(row);
  if (!IDENT.test(table) || keys.some((k) => !IDENT.test(k))) throw new Error("Invalid identifier in insert().");
  const stmt = db.prepare(
    `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`
  );
  return stmt.run(...keys.map((k) => row[k]));
};

export const update = (table, idValue, row, idColumn = "id") => {
  if (!IDENT.test(table) || !IDENT.test(idColumn)) throw new Error("Invalid identifier in update().");
  const keys = Object.keys(row).filter((k) => k !== idColumn);
  if (!keys.length) return;
  if (keys.some((k) => !IDENT.test(k))) throw new Error("Invalid identifier in update().");
  const stmt = db.prepare(
    `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE ${idColumn} = ?`
  );
  stmt.run(...keys.map((k) => row[k]), idValue);
};

export function settingRow(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? jsonParse(row.value, null) : null;
}

export function writeSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), nowIso());
}

export function audit(user, action, entity = "", entityId = "", detail = "", ip = "") {
  db.prepare(
    `INSERT INTO audit_log (user_id, user_email, action, entity, entity_id, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user?.id ?? null,
    user?.email ?? "system",
    action,
    entity,
    String(entityId ?? ""),
    typeof detail === "string" ? detail : JSON.stringify(detail),
    ip,
    nowIso()
  );
}

export { DATA_DIR };
