// Authentication, authorization and CSRF.
//
// Admin sessions are stateless signed cookies. The payload carries the user id,
// an expiry and the user's session_version, so bumping that column revokes every
// existing cookie for that account (password change, deactivation).
// CSRF uses double-submit: a random cookie mirrored in a hidden form field or
// X-CSRF-Token header, plus an Origin/Referer check for unsafe methods.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, audit, DATA_DIR } from "./db.js";
import { nowIso, str, emailOk } from "./util.js";

/* --------------------------------- secret -------------------------------- */

function loadSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, ".session-secret");
  try {
    if (fs.existsSync(file)) {
      const saved = fs.readFileSync(file, "utf8").trim();
      if (saved.length >= 32) return saved;
    }
  } catch { /* fall through to generate */ }
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(file, generated, { mode: 0o600 });
    console.warn("[auth] SESSION_SECRET not set — generated data/.session-secret. Set it in production.");
  } catch {
    console.warn("[auth] SESSION_SECRET not set and the data dir is not writable; sessions reset on restart.");
  }
  return generated;
}

export const SESSION_SECRET = loadSecret();
export const SESSION_COOKIE = "shop_session";
export const CSRF_COOKIE = "shop_csrf";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/* -------------------------------- passwords ------------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString("hex");
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, salt, hash] = String(stored || "").split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = crypto
      .scryptSync(String(password), salt, hash.length / 2, { N: Number(N), r: Number(r), p: Number(p) })
      .toString("hex");
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function passwordProblem(password) {
  const p = String(password ?? "");
  if (p.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return "Use at least one letter and one number.";
  return "";
}

/* --------------------------------- tokens -------------------------------- */

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

export function signToken(payload, ttlMs = SESSION_TTL_MS) {
  const body = b64({ ...payload, exp: Date.now() + ttlMs });
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k !== name) continue;
    try { return decodeURIComponent(v.join("=")); } catch { return v.join("="); }
  }
  return "";
}

export function cookieOptions(req, maxAgeMs) {
  const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: maxAgeMs // Express converts ms to Max-Age seconds
  };
}

export function setSessionCookie(req, res, user) {
  const token = signToken({ uid: user.id, v: user.session_version || 1 });
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, SESSION_TTL_MS));
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/* ---------------------------------- csrf --------------------------------- */

export function ensureCsrfCookie(req, res) {
  let token = readCookie(req, CSRF_COOKIE);
  if (!token || !/^[a-f0-9]{32,64}$/.test(token)) {
    token = crypto.randomBytes(24).toString("hex");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // the form needs to read it; it is not a credential by itself
      sameSite: "lax",
      secure: req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https",
      path: "/",
      maxAge: 12 * 60 * 60 * 1000
    });
  }
  res.locals.csrf = token;
  return token;
}

function sameValue(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function verifyCsrf(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const cookie = readCookie(req, CSRF_COOKIE);
  const sent = req.body?._csrf || req.get("x-csrf-token") || "";
  return sameValue(cookie, sent);
}

export function originAllowed(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.get("origin");
  if (!origin) return true; // non-browser clients without Origin still need the CSRF token
  try {
    const host = req.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* ---------------------------------- users -------------------------------- */

export const ROLES = ["owner", "manager", "staff", "viewer"];

const PERMISSIONS = [
  "dashboard.view", "settings.manage", "theme.manage", "content.manage", "catalog.manage",
  "services.manage", "orders.view", "orders.manage", "bookings.view", "bookings.manage",
  "customers.view", "customers.manage", "discounts.manage", "modules.manage", "users.manage",
  "media.manage", "inquiries.manage", "reviews.manage", "reports.view"
];

const ROLE_PERMISSIONS = {
  owner: new Set(PERMISSIONS),
  manager: new Set(PERMISSIONS.filter((p) => p !== "users.manage")),
  staff: new Set([
    "dashboard.view", "orders.view", "orders.manage", "bookings.view", "bookings.manage",
    "customers.view", "inquiries.manage", "catalog.manage", "media.manage"
  ]),
  viewer: new Set(["dashboard.view", "orders.view", "bookings.view", "customers.view"])
};

export function can(user, permission) {
  if (!user) return false;
  if (!permission) return true;
  return ROLE_PERMISSIONS[user.role]?.has(permission) || false;
}

export const permissionsFor = (role) => [...(ROLE_PERMISSIONS[role] || [])];

const publicUser = (row) =>
  row && {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: !!row.active,
    session_version: row.session_version,
    created_at: row.created_at,
    last_login_at: row.last_login_at
  };

export function countUsers() {
  return db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
}

export function listUsers() {
  return db.prepare("SELECT * FROM users ORDER BY created_at ASC").all().map(publicUser);
}

export function getUser(id) {
  return publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id)));
}

export function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(String(email || "").trim());
}

export function createUser({ email, name, password, role = "staff" }) {
  const cleanEmail = str(email, 160).toLowerCase();
  if (!emailOk(cleanEmail)) throw new Error("Enter a valid email address.");
  if (getUserByEmail(cleanEmail)) throw new Error("That email is already in use.");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if (!ROLES.includes(role)) throw new Error("Choose a valid role.");
  const info = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, role, active, session_version, created_at)
       VALUES (?, ?, ?, ?, 1, 1, ?)`
    )
    .run(cleanEmail, str(name, 120) || cleanEmail, hashPassword(password), role, nowIso());
  return getUser(info.lastInsertRowid);
}

export function updateUser(id, patch, actor = null) {
  const user = getUser(id);
  if (!user) throw new Error("User not found.");
  const next = {};
  if (patch.name !== undefined) next.name = str(patch.name, 120);
  if (patch.email !== undefined) {
    const email = str(patch.email, 160).toLowerCase();
    if (!emailOk(email)) throw new Error("Enter a valid email address.");
    const other = getUserByEmail(email);
    if (other && other.id !== user.id) throw new Error("That email is already in use.");
    next.email = email;
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new Error("Choose a valid role.");
    if (user.role === "owner" && patch.role !== "owner" && countOwners() <= 1) {
      throw new Error("There must be at least one owner.");
    }
    if (patch.role !== user.role) next.session_version = user.session_version + 1;
    next.role = patch.role;
  }
  if (patch.active !== undefined) {
    const active = patch.active ? 1 : 0;
    if (user.role === "owner" && !active && countOwners() <= 1) throw new Error("There must be at least one active owner.");
    if (actor?.id === user.id && !active) throw new Error("You cannot deactivate your own account.");
    if (!active) next.session_version = user.session_version + 1;
    next.active = active;
  }
  const keys = Object.keys(next);
  if (keys.length) {
    db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => next[k]), user.id);
  }
  return getUser(user.id);
}

export function setUserPassword(id, password, { actor = null } = {}) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const user = getUser(id);
  if (!user) throw new Error("User not found.");
  db.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?").run(
    hashPassword(password),
    user.id
  );
}

export function deleteUser(id, actor) {
  const user = getUser(id);
  if (!user) return;
  if (actor?.id === user.id) throw new Error("You cannot delete your own account.");
  if (user.role === "owner" && countOwners() <= 1) throw new Error("There must be at least one owner.");
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
}

const countOwners = () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1").get().n;

export function verifyLogin(email, password, ip = "") {
  const row = getUserByEmail(email);
  // Always run a hash comparison so an unknown email is not faster than a wrong password.
  const stored = row?.password_hash || hashPassword("not-a-real-password");
  const ok = verifyPassword(password, stored) && !!row && !!row.active;
  if (!ok) {
    audit(null, "login.failed", "user", row?.id ?? "", str(email, 160), ip);
    return null;
  }
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(nowIso(), row.id);
  audit(publicUser(row), "login", "user", row.id, "", ip);
  return publicUser(row);
}

/* ------------------------------- middleware ------------------------------ */

export function attachUser(req, res, next) {
  req.user = null;
  res.locals.user = null;
  const token = readCookie(req, SESSION_COOKIE);
  const payload = token ? verifyToken(token) : null;
  if (payload?.uid) {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.uid);
    if (row && row.active && (payload.v || 1) === row.session_version) {
      req.user = publicUser(row);
      res.locals.user = req.user;
    }
  }
  res.locals.can = (perm) => can(req.user, perm);
  ensureCsrfCookie(req, res);
  next();
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  const wantsHtml = (req.method === "GET" || req.method === "HEAD") && String(req.headers.accept || "").includes("text/html");
  if (wantsHtml) return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`);
  res.status(401).json({ error: "Authentication required." });
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return requireAuth(req, res, next);
    if (!can(req.user, permission)) {
      res.status(403);
      return res.status(403).send(
        `<!doctype html><meta charset="utf-8"><title>Not allowed</title>` +
          `<p style="font-family:system-ui;padding:3rem">Your role (${req.user.role}) does not allow this action. ` +
          `<a href="/admin">Back to the dashboard</a></p>`
      );
    }
    next();
  };
}

export { PERMISSIONS };
