// HTTP plumbing shared by admin and site routers.

import crypto from "node:crypto";
import { esc } from "./util.js";

/* ---------------------------------- flash -------------------------------- */

const FLASH_COOKIE = "shop_flash";

export function setFlash(res, type, message) {
  const value = Buffer.from(JSON.stringify({ type, message: String(message).slice(0, 500) })).toString("base64url");
  res.cookie(FLASH_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60_000 });
}

export function popFlash(req, res) {
  const raw = req.cookies?.[FLASH_COOKIE] || readCookieRaw(req, FLASH_COOKIE);
  if (!raw) return null;
  res.clearCookie(FLASH_COOKIE, { path: "/" });
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (!parsed?.message) return null;
    return { type: parsed.type === "error" ? "error" : "success", message: String(parsed.message) };
  } catch {
    return null;
  }
}

function readCookieRaw(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

/* ------------------------------- rate limits ----------------------------- */

const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 30, key = (req) => req.ip, message = "Too many attempts. Try again shortly." } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = `${key(req)}:${req.path}`;
    let b = buckets.get(bucketKey);
    if (!b || now > b.reset) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(bucketKey, b);
    }
    b.count += 1;
    // Opportunistic cleanup keeps the map from growing without a timer.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
    if (b.count > max) {
      res.status(429);
      if (req.accepts("json") && !req.accepts("html")) return res.json({ error: message });
      return res.send(`<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:3rem">${esc(message)}</p>`);
    }
    next();
  };
}

export const resetRateLimits = () => buckets.clear();

/* ------------------------------- middleware ------------------------------ */

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function noStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

// Request id makes a support email actionable without exposing a stack trace.
export function requestId(req, res, next) {
  req.id = crypto.randomBytes(6).toString("hex");
  res.set("X-Request-Id", req.id);
  next();
}

export function wantsJson(req) {
  return req.path.startsWith("/api/") || (req.accepts(["json", "html"]) === "json" && !req.accepts("html"));
}

export function notFound(req, res) {
  res.status(404);
  if (wantsJson(req)) return res.json({ error: "Not found" });
  res.type("html").send(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Page not found</title><body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1c1917">` +
      `<h1 style="font-size:1.5rem">Page not found</h1><p style="color:#6b6560">That page does not exist or has moved.</p>` +
      `<p><a href="/" style="color:#1f5c4a">Back to the site</a></p></body></html>`
  );
}

export function errorHandler(err, req, res, _next) {
  console.error(`[${req.id || "-"}] ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return;
  res.status(err.status || 500);
  if (wantsJson(req)) return res.json({ error: "Something went wrong. Please try again." });
  res.type("html").send(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Something went wrong</title><body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1c1917">` +
      `<h1 style="font-size:1.5rem">Something went wrong</h1>` +
      `<p style="color:#6b6560">The request could not be completed. Reference <code>${esc(req.id || "-")}</code>.</p>` +
      `<p><a href="/" style="color:#1f5c4a">Back to the site</a></p></body></html>`
  );
}

/* ------------------------------ form helpers ----------------------------- */

export const bodyStr = (body, key, max = 500) => String(body?.[key] ?? "").trim().slice(0, max);
export const bodyBool = (body, key) => {
  const v = body?.[key];
  return v === "1" || v === "on" || v === "true" || v === "yes";
};
export const bodyArr = (body, key) => {
  const v = body?.[key];
  if (Array.isArray(v)) return v;
  return v === undefined || v === null ? [] : [v];
};
