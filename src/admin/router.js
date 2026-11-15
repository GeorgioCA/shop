// Admin: authentication, setup wizard, dashboard, settings, theme, modules,
// media and users. Business screens live in commerce.js.

import express from "express";
import fs from "node:fs";
import { db } from "../core/db.js";
import { config, SCHEMA, saveConfig, markSetupComplete, isSetupComplete, DAYS } from "../core/config.js";
import { isEnabled, allModules, setModuleEnabled, MODULE_MAP } from "../core/modules.js";
import {
  attachUser, requireAuth, requirePermission, can, verifyLogin, countUsers, createUser, getUser,
  listUsers, updateUser, setUserPassword, deleteUser, setSessionCookie, clearSessionCookie, verifyCsrf, ROLES
} from "../core/auth.js";
import { setFlash, popFlash, noStore, asyncHandler, rateLimit, bodyBool } from "../core/http.js";
import { esc, money, fmtDate, int, str } from "../core/util.js";
import { upload, saveUpload, listMedia, updateMedia, deleteMedia, mediaUrl, getMedia, MAX_BYTES } from "../core/media.js";
import { audit } from "../core/db.js";
import { adminLayout } from "../views/layout.js";
import { renderLogin, renderFirstRun, renderSetup, renderSettings, renderTheme, renderDashboard } from "../views/admin/forms.js";
import { renderMedia, renderModules, renderUsers, renderUserEdit } from "../views/admin/system.js";
import { orderStats, recentOrders, topProducts, expireStalePending } from "../modules/orders.js";
import { bookingStats, upcomingBookings } from "../modules/bookings.js";
import { inquiryStats, listInquiries } from "../modules/inquiries.js";
import { productStats, lowStock } from "../modules/catalog.js";
import { serviceStats } from "../modules/services.js";
import { presetList, PRESET_GROUPS, applyPreset, PRESETS } from "../presets/index.js";

export const admin = express.Router();
admin.use(noStore);

const view = (req, res, { title, body, active = "", wide = false, subtitle = "", actions = "", breadcrumbs = [] }) => {
  res.send(adminLayout({
    title, body, active, wide, subtitle, actions, breadcrumbs,
    user: req.user, flash: popFlash(req, res), csrf: res.locals.csrf
  }));
};

/* ---------------------------------- auth ---------------------------------- */

admin.get("/login", (req, res) => {
  if (req.user) return res.redirect("/admin");
  res.send(renderLogin({ next: String(req.query.next || "/admin"), businessName: config().business.name, hasUsers: countUsers() > 0 }));
});

admin.post("/login", rateLimit({ windowMs: 60_000, max: 10, message: "Too many sign-in attempts. Wait a minute." }), (req, res) => {
  const user = verifyLogin(req.body?.email, req.body?.password, req.ip);
  if (!user) {
    return res.status(401).send(renderLogin({ error: "Email or password is incorrect.", next: String(req.body?.next || "/admin"), businessName: config().business.name }));
  }
  setSessionCookie(req, res, user);
  const next = String(req.body?.next || "/admin");
  return res.redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
});

admin.post("/logout", requireAuth, (req, res) => {
  clearSessionCookie(res);
  res.redirect("/admin/login");
});

/* -------------------------------- first run ------------------------------- */

// Mounted at /setup in app.js when the users table is empty.
export const firstRun = express.Router();
firstRun.get("/", (req, res) => {
  if (countUsers() > 0) return res.redirect("/admin/login");
  res.send(renderFirstRun({}));
});
firstRun.post("/", rateLimit({ windowMs: 60_000, max: 6 }), (req, res) => {
  if (countUsers() > 0) return res.redirect("/admin/login");
  const values = { business_name: str(req.body?.business_name, 120), name: str(req.body?.name, 120), email: str(req.body?.email, 160) };
  try {
    if (req.body?.password !== req.body?.password2) throw new Error("The passwords do not match.");
    if (!values.business_name) throw new Error("Enter your business name.");
    const user = createUser({ email: values.email, name: values.name, password: req.body?.password, role: "owner" });
    saveConfig("business", { name: values.business_name });
    setSessionCookie(req, res, user);
    audit(user, "setup.owner_created", "user", user.id, "", req.ip);
    res.redirect("/admin/setup");
  } catch (err) {
    res.status(400).send(renderFirstRun({ error: err.message, values }));
  }
});

/* ------------------------------- admin shell ------------------------------ */

// Everything below requires a session, except the login routes above.
const protectedRoutes = express.Router();
protectedRoutes.use(requireAuth);
protectedRoutes.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  // Multipart bodies are parsed by multer inside the route, so the hidden token
  // is not readable yet. Those handlers verify the token after parsing.
  if (req.is("multipart/form-data")) return oauthOriginCheck(req, res, next);
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh the page and try again.");
  oauthOriginCheck(req, res, next);
});
function oauthOriginCheck(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    if (new URL(origin).host === req.get("host")) return next();
  } catch { /* invalid origin */ }
  return res.status(403).send("Cross-origin request blocked.");
}

/* -------------------------------- dashboard ------------------------------- */

protectedRoutes.get("/", requirePermission("dashboard.view"), (req, res) => {
  expireStalePending(2);
  const stats = {
    orders: orderStats(),
    bookings: bookingStats(),
    inquiries: inquiryStats(),
    products: productStats(),
    services: serviceStats()
  };
  view(req, res, {
    title: "Dashboard",
    active: "/admin",
    subtitle: `${config().business.name} · ${fmtDate(new Date(), config().business.timezone, { weekday: "long", month: "long", day: "numeric" })}`,
    body: renderDashboard({
      csrf: res.locals.csrf, stats,
      recentOrders: isEnabled("commerce") ? recentOrders(6) : [],
      recentBookings: isEnabled("bookings") ? upcomingBookings(5) : [],
      recentInquiries: isEnabled("inquiries") ? listInquiries({ perPage: 4 }).rows : [],
      lowStock: isEnabled("inventory") ? lowStock() : [],
      topProducts: isEnabled("commerce") ? topProducts(5) : []
    })
  });
});

/* --------------------------------- setup ---------------------------------- */

protectedRoutes.get("/setup", requirePermission("settings.manage"), (req, res) => {
  const groups = PRESET_GROUPS.map((g) => ({
    label: g.label,
    items: g.keys.map((key) => {
      const meta = presetList().find((x) => x.key === key);
      if (!meta) return null;
      return { ...meta, counts: presetCounts(key) };
    }).filter(Boolean)
  }));
  view(req, res, {
    title: "Setup wizard",
    active: "/admin/setup",
    subtitle: "Configure the platform for this business. Everything here can be changed later.",
    body: renderSetup({ csrf: res.locals.csrf, quote: { groups } })
  });
});

function presetCounts(key) {
  // Counts come from the preset definition, not the database, so they describe
  // what applying it would write.
  const p = PRESETS[key];
  return { products: p?.products.length || 0, services: p?.services.length || 0, pages: (p?.pages.length || 0) + 1 };
}

protectedRoutes.post("/setup/preset", requirePermission("settings.manage"), (req, res) => {
  try {
    const result = applyPreset(String(req.body?.preset || ""), { replaceHome: true });
    audit(req.user, "setup.preset_applied", "settings", result.preset, JSON.stringify(result), req.ip);
    setFlash(res, "success", `Applied “${String(req.body?.preset)}”. Review the site, then finish setup.`);
    res.redirect("/admin/setup");
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect("/admin/setup");
  }
});

protectedRoutes.post("/setup/complete", requirePermission("settings.manage"), (req, res) => {
  markSetupComplete(config().setup.preset || "custom");
  audit(req.user, "setup.completed", "settings", "", "", req.ip);
  setFlash(res, "success", "Setup complete. Your site is live.");
  res.redirect("/admin");
});

/* -------------------------------- settings -------------------------------- */

const SETTINGS_NAMESPACES = ["business", "hours", "catalog", "commerce", "bookings", "email"];

protectedRoutes.get("/settings/:ns", requirePermission("settings.manage"), (req, res, next) => {
  const ns = req.params.ns;
  if (!SETTINGS_NAMESPACES.includes(ns)) return next();
  view(req, res, {
    title: SCHEMA[ns].label,
    active: `/admin/settings/${ns}`,
    subtitle: SCHEMA[ns].description,
    body: renderSettings({ namespace: ns, csrf: res.locals.csrf })
  });
});

protectedRoutes.post("/settings/:ns", requirePermission("settings.manage"), (req, res, next) => {
  const ns = req.params.ns;
  if (!SETTINGS_NAMESPACES.includes(ns)) return next();
  const def = SCHEMA[ns];
  const input = {};
  for (const [key, field] of Object.entries(def.fields)) {
    if (field.type === "hours") continue;
    if (field.type === "bool") input[key] = bodyBool(req.body, key);
    else if (req.body[key] === undefined && req.body[`${key}_hex`] === undefined) continue;
    else if (field.type === "color") input[key] = req.body[`${key}_hex`] || req.body[key];
    else input[key] = req.body[key];
  }
  if (ns === "hours") {
    const hours = {};
    for (const [day] of DAYS) {
      hours[day] = {
        closed: bodyBool(req.body, `hours_${day}_closed`),
        open: req.body[`hours_${day}_open`],
        close: req.body[`hours_${day}_close`]
      };
    }
    input.hours = hours;
  }
  try {
    saveConfig(ns, input);
    audit(req.user, "settings.update", "settings", ns, "", req.ip);
    setFlash(res, "success", "Settings saved.");
    res.redirect(`/admin/settings/${ns}`);
  } catch (err) {
    view(req, res.status(400), {
      title: SCHEMA[ns].label,
      active: `/admin/settings/${ns}`,
      body: renderSettings({ namespace: ns, csrf: res.locals.csrf, error: err.message })
    });
  }
});

/* --------------------------------- theme ---------------------------------- */

protectedRoutes.get("/theme", requirePermission("theme.manage"), (req, res) => {
  view(req, res, { title: "Appearance", active: "/admin/theme", subtitle: "Branding used across the site and email.", body: renderTheme({ csrf: res.locals.csrf }) });
});

protectedRoutes.post("/theme", requirePermission("theme.manage"), (req, res) => {
  const input = {};
  for (const [key, field] of Object.entries(SCHEMA.theme.fields)) {
    if (field.type === "bool") input[key] = bodyBool(req.body, key);
    else if (req.body[key] === undefined && req.body[`${key}_hex`] === undefined) continue;
    else if (field.type === "color") input[key] = req.body[`${key}_hex`] || req.body[key];
    else input[key] = req.body[key];
  }
  try {
    saveConfig("theme", input);
    audit(req.user, "theme.update", "settings", "theme", "", req.ip);
    setFlash(res, "success", "Appearance published.");
    res.redirect("/admin/theme");
  } catch (err) {
    view(req, res.status(400), { title: "Appearance", active: "/admin/theme", body: renderTheme({ csrf: res.locals.csrf, error: err.message }) });
  }
});

/* -------------------------------- modules --------------------------------- */

protectedRoutes.get("/modules", requirePermission("modules.manage"), (req, res) => {
  view(req, res, { title: "Modules", active: "/admin/modules", subtitle: "Turn capabilities on or off. Data is never deleted.", body: renderModules({ modules: allModules(), csrf: res.locals.csrf }) });
});

protectedRoutes.post("/modules/:key/toggle", requirePermission("modules.manage"), (req, res) => {
  const key = req.params.key;
  const on = String(req.body?.enabled) === "1";
  const cascade = bodyBool(req.body, "cascade");
  const result = setModuleEnabled(key, on, { cascade });
  if (!result.ok) {
    setFlash(res, "error", result.error);
  } else {
    audit(req.user, on ? "module.enable" : "module.disable", "module", key, JSON.stringify({ disabled: result.disabled }), req.ip);
    setFlash(res, "success", on ? `${MODULE_MAP.get(key)?.name} enabled.` : `${MODULE_MAP.get(key)?.name} disabled${result.disabled.length ? `, along with ${result.disabled.join(", ")}` : ""}. Data is untouched.`);
  }
  res.redirect("/admin/modules");
});

/* --------------------------------- media ---------------------------------- */

protectedRoutes.get("/media", requirePermission("media.manage"), (req, res) => {
  view(req, res, { title: "Media", active: "/admin/media", subtitle: "Every image the site uses.", body: renderMedia({ items: listMedia(300), csrf: res.locals.csrf }) });
});

protectedRoutes.post(
  "/media",
  requirePermission("media.manage"),
  (req, res, next) => upload.single("file")(req, res, (err) => {
    if (err) { setFlash(res, "error", err.message); return res.redirect("/admin/media"); }
    next();
  }),
  asyncHandler(async (req, res) => {
    if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh the page and try again.");
    try {
      const row = await saveUpload(req.file, { alt: str(req.body?.alt, 200) });
      audit(req.user, "media.upload", "media", row.id, row.filename, req.ip);
      setFlash(res, "success", "Image uploaded.");
    } catch (err) {
      setFlash(res, "error", err.message);
    }
    res.redirect("/admin/media");
  })
);

protectedRoutes.post("/media/upload", requirePermission("media.manage"), upload.single("file"), asyncHandler(async (req, res) => {
  if (!verifyCsrf(req)) return res.status(403).json({ error: "Session expired. Refresh the page and try again." });
  try {
    const row = await saveUpload(req.file, { alt: "" });
    res.json({ ok: true, filename: row.filename, url: mediaUrl(row.filename) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

protectedRoutes.post("/media/:id", requirePermission("media.manage"), (req, res) => {
  updateMedia(req.params.id, { alt: req.body?.alt });
  res.redirect("/admin/media");
});

protectedRoutes.post("/media/:id/delete", requirePermission("media.manage"), (req, res) => {
  const result = deleteMedia(req.params.id);
  setFlash(res, result.ok ? "success" : "error", result.ok ? "Image deleted." : result.error);
  res.redirect("/admin/media");
});

/* ---------------------------------- users --------------------------------- */

protectedRoutes.get("/users", requirePermission("users.manage"), (req, res) => {
  view(req, res, { title: "Users", active: "/admin/users", subtitle: "Who can sign in and what they can do.", body: renderUsers({ users: listUsers(), csrf: res.locals.csrf, me: req.user }) });
});

protectedRoutes.post("/users", requirePermission("users.manage"), (req, res) => {
  try {
    createUser({ name: req.body?.name, email: req.body?.email, password: req.body?.password, role: req.body?.role });
    audit(req.user, "user.create", "user", "", str(req.body?.email, 160), req.ip);
    setFlash(res, "success", "User created.");
  } catch (err) {
    setFlash(res, "error", err.message);
  }
  res.redirect("/admin/users");
});

protectedRoutes.get("/users/:id", requirePermission("users.manage"), (req, res, next) => {
  const user = getUser(req.params.id);
  if (!user) return next();
  view(req, res, { title: user.name, active: "/admin/users", body: renderUserEdit({ user, csrf: res.locals.csrf }) });
});

protectedRoutes.post("/users/:id", requirePermission("users.manage"), (req, res) => {
  try {
    updateUser(req.params.id, { name: req.body?.name, email: req.body?.email, role: req.body?.role }, req.user);
    audit(req.user, "user.update", "user", req.params.id, "", req.ip);
    setFlash(res, "success", "User saved.");
    res.redirect("/admin/users");
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect(`/admin/users/${req.params.id}`);
  }
});

protectedRoutes.post("/users/:id/toggle", requirePermission("users.manage"), (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.redirect("/admin/users");
  try {
    updateUser(user.id, { active: !user.active }, req.user);
    setFlash(res, "success", user.active ? "User disabled." : "User enabled.");
  } catch (err) {
    setFlash(res, "error", err.message);
  }
  res.redirect("/admin/users");
});

protectedRoutes.post("/users/:id/password", requirePermission("users.manage"), (req, res) => {
  try {
    setUserPassword(req.params.id, req.body?.password);
    audit(req.user, "user.password", "user", req.params.id, "", req.ip);
    setFlash(res, "success", "Password updated. Existing sessions were signed out.");
  } catch (err) {
    setFlash(res, "error", err.message);
  }
  res.redirect(`/admin/users/${req.params.id}`);
});

protectedRoutes.post("/users/:id/delete", requirePermission("users.manage"), (req, res) => {
  try {
    deleteUser(req.params.id, req.user);
    audit(req.user, "user.delete", "user", req.params.id, "", req.ip);
    setFlash(res, "success", "User deleted.");
    res.redirect("/admin/users");
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect("/admin/users");
  }
});

admin.use(protectedRoutes);
