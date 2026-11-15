// Small, dependency-free helpers shared by every layer.
// Money is always integer cents. Dates are stored as ISO 8601 UTC strings.

export const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Attributes are built from trusted markup (our own components), never user text.
// Named so a reviewer can see intent at the call site.
export const raw = (html) => ({ __html: String(html ?? "") });
const asHtml = (v) => (v && typeof v === "object" && "__html" in v ? v.__html : esc(v));

export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? asHtml(values[i]) : ""), "");
}

export function money(cents, currency = "CAD", locale = "en-CA") {
  const n = Number(cents) || 0;
  try {
    return new Intl.NumberFormat(locale || "en-CA", {
      style: "currency",
      currency: currency || "CAD",
      minimumFractionDigits: n % 100 === 0 ? 0 : 2
    }).format(n / 100);
  } catch {
    return `$${(n / 100).toFixed(2)}`;
  }
}

// "12.50" | "12,50" | "$12.50" -> 1250. Blank -> null so callers can tell "unset".
export function parseCents(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  let cleaned = String(value).replace(/[^0-9.,-]/g, "");
  // "1,234.56" uses a thousands separator; "12,50" uses a decimal comma.
  if (cleaned.includes(",") && cleaned.includes(".")) cleaned = cleaned.replace(/,/g, "");
  else if (cleaned.includes(",")) cleaned = cleaned.replace(",", ".");
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export const centsInput = (cents) => (cents === null || cents === undefined ? "" : (Number(cents) / 100).toFixed(2));

export function slugify(input, fallback = "item") {
  const s = String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return s || fallback;
}

export function uniqueSlug(base, exists) {
  const root = slugify(base);
  if (!exists(root)) return root;
  for (let i = 2; i < 500; i++) if (!exists(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now()}`;
}

export const id = (prefix = "") =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const nowIso = () => new Date().toISOString();

/* ------------------------------- numbers -------------------------------- */

export function int(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function num(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function bool(value) {
  if (typeof value === "boolean") return value;
  const v = String(value ?? "").toLowerCase().trim();
  return v === "1" || v === "on" || v === "true" || v === "yes";
}

/* ------------------------------- strings -------------------------------- */

export const str = (v, max = 5000) => String(v ?? "").trim().slice(0, max);
export const oneLine = (v, max = 300) => str(v, max).replace(/\s+/g, " ");

export function emailOk(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? "").trim());
}

// Accepts 10-digit North American numbers and international +CC forms; keeps
// the leading + when present. Display formatting is a separate concern.
export function phoneOk(value) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function truncate(text, n = 160) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

export function listFromLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(","));
  return [head, ...body].join("\r\n");
}

/* -------------------------------- time ---------------------------------- */

const partsFormatter = (tz) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short"
  });

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date, tz = "UTC") {
  const d = date instanceof Date ? date : new Date(date);
  let parts;
  try {
    parts = partsFormatter(tz).formatToParts(d);
  } catch {
    parts = partsFormatter("UTC").formatToParts(d);
  }
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0
  };
}

// How far the zone is from UTC at that instant.
function offsetMs(date, tz) {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

// Wall-clock time in `tz` -> the UTC instant. Two passes settle DST edges.
export function zonedToUtc(y, m, d, hh = 0, mm = 0, tz = "UTC") {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const first = guess - offsetMs(new Date(guess), tz);
  const second = guess - offsetMs(new Date(first), tz);
  if (first === second) return new Date(first);
  // A DST transition means one of the candidates is the wall time asked for.
  // In the spring-forward gap neither matches, so take the later instant
  // (02:30 becomes 03:30 rather than 01:30).
  const asked = hh * 60 + mm;
  const wall = (t) => { const p = localParts(new Date(t), tz); return p.hour * 60 + p.minute; };
  if (wall(second) === asked) return new Date(second);
  if (wall(first) === asked) return new Date(first);
  return new Date(Math.max(first, second));
}

export function localDateStr(dateOrIso, tz = "UTC") {
  const p = localParts(dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso), tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function dayOfWeek(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function fmtDate(value, tz, opts = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // dateStyle cannot be combined with weekday/year/month/day; only add the
  // medium default when the caller did not ask for specific parts.
  const explicit = ["weekday", "year", "month", "day"].some((k) => k in opts);
  const options = { timeZone: tz, ...(explicit ? {} : { dateStyle: "medium" }), ...opts };
  try {
    return new Intl.DateTimeFormat("en-CA", options).format(d);
  } catch {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "medium" }).format(d); }
    catch { return d.toISOString().slice(0, 10); }
  }
}

export function fmtDateTime(value, tz) {
  return `${fmtDate(value, tz)} · ${fmtTime(value, tz)}`;
}

export function fmtTime(value, tz) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

// A datetime-local value ("2026-05-01T09:30") is wall-clock time in the
// business's zone, not the server's. Parse it explicitly.
export function parseLocalDateTime(value, tz = "UTC") {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const d = zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "09:30" -> minutes. Bad input -> null, so callers can reject rather than default.
export function hhmmToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export const minutesToHhmm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

export const minutesToLabel = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
};

/* -------------------------------- routing -------------------------------- */

export function paginate(total, page, perPage = 25) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(pages, Math.max(1, int(page, { fallback: 1 })));
  return { total, page: current, pages, perPage, offset: (current - 1) * perPage };
}

export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function safeNext(value, fallback = "/admin") {
  const s = String(value ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export const initials = (name) =>
  String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
