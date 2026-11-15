import express from "express";
import { db } from "./core/db.js";
import { config } from "./core/config.js";
import { isEnabled } from "./core/modules.js";
import { attachUser } from "./core/auth.js";
import { requestId, notFound, errorHandler, noStore } from "./core/http.js";
import { publicDir } from "./core/assets.js";
import { UPLOAD_DIR } from "./core/media.js";
import { constructEvent, stripeConfigured } from "./core/payments.js";
import { getOrder, markPaid } from "./modules/orders.js";
import { sendOrderConfirmation } from "./core/mail.js";
import { site } from "./site/router.js";
import { admin, firstRun } from "./admin/router.js";
import { commerce } from "./admin/commerce.js";
import { contentAdmin } from "./admin/content.js";

function cookieParser(req, _res, next) {
  req.cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!key) continue;
    try { req.cookies[key] = decodeURIComponent(raw); } catch { req.cookies[key] = raw; }
  }
  next();
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    );
    next();
  });
  app.use(cookieParser);

  // Stripe needs the raw body to verify the signature; mount before JSON parsing.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeConfigured() || !secret) return res.status(503).send("Stripe webhook is not configured.");
    let event;
    try {
      event = constructEvent(req.body, req.get("stripe-signature"));
    } catch (err) {
      console.error("[stripe] signature:", err.message);
      return res.status(400).send("Invalid signature.");
    }
    try {
      if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
        const session = event.data.object;
        if (session.payment_status !== "paid") return res.json({ received: true });
        const order = getOrder(session.metadata?.order_number || session.client_reference_id);
        if (order) {
          markPaid(order.id, { stripeSession: session.id });
          const paid = getOrder(order.id);
          sendOrderConfirmation(paid, paid.items, `${process.env.PUBLIC_BASE_URL || ""}/order/${paid.token}`);
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error("[stripe] handler:", err);
      res.status(500).json({ error: "Webhook handler failed." });
    }
  });

  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  // Sessions and the CSRF token are needed by public forms as well as the admin.
  app.use(attachUser);
  app.use(express.static(publicDir, { maxAge: "1h", index: false, dotfiles: "ignore" }));
  app.use("/media", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true, index: false, dotfiles: "deny", fallthrough: true }));

  app.get("/health", (_req, res) => res.json({ ok: true, schema: db.prepare("PRAGMA user_version").get().user_version }));
  app.get("/favicon.ico", (_req, res) => res.status(204).end());

  app.use("/setup", firstRun);
  app.use(site);
  // The shell handles /admin/login first, then falls through to entity routers.
  // Mounting a router with global auth middleware before the login route would
  // make signing in impossible.
  app.use("/admin", admin);
  app.use("/admin", commerce);
  app.use("/admin", contentAdmin);
  app.use("/admin", (req, res) => {
    res.status(404).send(
      `<!doctype html><meta charset="utf-8"><title>Not found</title>` +
        `<body style="font-family:system-ui;padding:3rem"><h1 style="font-size:1.3rem">Page not found</h1>` +
        `<p style="color:#6b6560">That admin page does not exist.</p><p><a href="/admin">Back to the dashboard</a></p></body>`
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export { attachUser, noStore, config, isEnabled };
