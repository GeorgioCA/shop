// Boot: environment -> database -> configuration -> app -> listen.

import { createApp } from "./src/app.js";
import { loadConfig, config } from "./src/core/config.js";
import { ensureModules } from "./src/core/modules.js";
import { countUsers } from "./src/core/auth.js";
import { db, schemaVersion } from "./src/core/db.js";
import { expireStalePending } from "./src/modules/orders.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

process.on("unhandledRejection", (err) => console.error("[unhandled]", err));
process.on("uncaughtException", (err) => console.error("[uncaught]", err));

ensureModules();
loadConfig();

// One-shot cleanup, safe on every boot: unpaid Stripe sessions older than 48 h.
try { expireStalePending(2); } catch (err) { console.error("[orders] expiry:", err.message); }

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  const business = config().business.name;
  console.log(`[platform] ${business} — http://localhost:${PORT} (schema v${schemaVersion()})`);
  console.log(`[platform] setup ${config().setup.completed ? "complete" : "pending"} · ${countUsers()} user(s) · modules: ${
    db.prepare("SELECT group_concat(key) AS k FROM modules WHERE enabled = 1").get().k || "none"
  }`);
  if (!countUsers()) console.log(`[platform] first run: open /setup to create the owner account`);
});

function shutdown(signal) {
  console.log(`[platform] ${signal} — closing`);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
