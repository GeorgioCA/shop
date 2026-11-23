// Module registry. A module is a capability boundary: routes, admin screens and
// navigation all consult it. Disabling never deletes rows — it hides capability.

import { db, jsonParse } from "./db.js";
import { nowIso } from "./util.js";

export const MODULES = [
  {
    key: "content",
    name: "Website content",
    description: "Pages, homepage sections, navigation, FAQs and testimonials.",
    category: "Foundation",
    core: true,
    requires: [],
    defaultEnabled: true,
    features: ["Pages and sections", "Navigation editor", "FAQs", "Testimonials", "SEO"]
  },
  {
    key: "catalog",
    name: "Product catalog",
    description: "Physical or digital products with categories, images, variants and attributes.",
    category: "Selling",
    requires: [],
    defaultEnabled: true,
    features: ["Products", "Categories", "Variants", "Featured items"]
  },
  {
    key: "services",
    name: "Service catalog",
    description: "Services with durations, pricing types and descriptions.",
    category: "Selling",
    requires: [],
    defaultEnabled: false,
    features: ["Services", "Service categories", "Duration", "Fixed / from / quote pricing"]
  },
  {
    key: "commerce",
    name: "Online ordering",
    description: "Cart, checkout, order records and order management.",
    category: "Selling",
    requires: ["catalog"],
    defaultEnabled: true,
    features: ["Cart", "Checkout", "Pickup / delivery", "Order management", "Order emails"]
  },
  {
    key: "payments",
    name: "Card payments",
    description: "Online card payments through Stripe Checkout or Helcim (Canadian processor). Offline methods work without either.",
    category: "Selling",
    requires: ["commerce"],
    defaultEnabled: false,
    features: ["Stripe Checkout", "Helcim Pay (CAD/USD)", "Signed webhooks", "Paid / unpaid states"]
  },
  {
    key: "promotions",
    name: "Discounts",
    description: "Percentage or fixed-amount codes with limits and expiry.",
    category: "Growth",
    requires: ["commerce"],
    defaultEnabled: false,
    features: ["Discount codes", "Minimum spend", "Usage caps", "Expiry"]
  },
  {
    key: "inventory",
    name: "Stock tracking",
    description: "Counted stock, sold-out flags and low-stock alerts. Off means made-to-order.",
    category: "Operations",
    requires: ["catalog"],
    defaultEnabled: false,
    features: ["Stock counts", "Sold-out switch", "Low-stock alerts"]
  },
  {
    key: "delivery",
    name: "Delivery",
    description: "Delivery fees, free-delivery threshold and area messaging at checkout.",
    category: "Operations",
    requires: ["commerce"],
    defaultEnabled: false,
    features: ["Delivery option", "Fee rules", "Delivery area"]
  },
  {
    key: "bookings",
    name: "Appointments",
    description: "Availability slots, booking requests or automatic confirmation.",
    category: "Operations",
    requires: ["services"],
    defaultEnabled: false,
    features: ["Slot generation", "Booking management", "Time off", "Staff assignment"]
  },
  {
    key: "inquiries",
    name: "Inquiries",
    description: "Contact and quote-request forms delivered to the back office.",
    category: "Growth",
    requires: [],
    defaultEnabled: true,
    features: ["Contact form", "Quote requests", "Inquiry inbox"]
  },
  {
    key: "accounts",
    name: "Customer accounts",
    description: "Email-verified customer sign-in, order history and saved details.",
    category: "Growth",
    requires: [],
    defaultEnabled: false,
    features: ["Email-verified sign-up", "Customer login", "Order history", "Booking history"]
  },
  {
    key: "reviews",
    name: "Reviews",
    description: "Customer reviews with moderation, on product and service pages.",
    category: "Growth",
    requires: [],
    defaultEnabled: false,
    features: ["Review collection", "Moderation", "Ratings"]
  },
  {
    key: "loyalty",
    name: "Loyalty points",
    description: "Points earned on paid orders and redeemable as a discount.",
    category: "Growth",
    requires: ["accounts", "commerce"],
    defaultEnabled: false,
    features: ["Points ledger", "Earn rate", "Redeem at checkout"]
  },
  {
    key: "newsletter",
    name: "Newsletter",
    description: "Email capture in the footer and a subscriber list.",
    category: "Growth",
    requires: [],
    defaultEnabled: false,
    features: ["Signup form", "Subscriber list", "CSV export"]
  }
];

export const MODULE_MAP = new Map(MODULES.map((m) => [m.key, m]));

export function ensureModules() {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO modules (key, enabled, config, sort, updated_at) VALUES (?, ?, '{}', ?, ?)`
  );
  MODULES.forEach((m, i) => insert.run(m.key, m.defaultEnabled || m.core ? 1 : 0, (i + 1) * 10, nowIso()));
}

export function moduleRows() {
  return db.prepare("SELECT * FROM modules").all();
}

export function allModules() {
  const rows = new Map(moduleRows().map((r) => [r.key, r]));
  return MODULES.map((m) => {
    const row = rows.get(m.key);
    return {
      ...m,
      enabled: m.core ? true : !!(row ? row.enabled : m.defaultEnabled),
      config: jsonParse(row?.config, {}),
      sort: row?.sort ?? 100
    };
  }).sort((a, b) => a.sort - b.sort);
}

export function isEnabled(key) {
  const m = MODULE_MAP.get(key);
  if (!m) return false;
  if (m.core) return true;
  const row = db.prepare("SELECT enabled FROM modules WHERE key = ?").get(key);
  return !!(row ? row.enabled : m.defaultEnabled);
}

export const enabledKeys = () => allModules().filter((m) => m.enabled).map((m) => m.key);

export function moduleConfig(key) {
  const row = db.prepare("SELECT config FROM modules WHERE key = ?").get(key);
  return { ...(MODULE_MAP.get(key)?.config || {}), ...jsonParse(row?.config, {}) };
}

export function saveModuleConfig(key, patch) {
  const next = { ...moduleConfig(key), ...patch };
  db.prepare("UPDATE modules SET config = ?, updated_at = ? WHERE key = ?").run(JSON.stringify(next), nowIso(), key);
  return next;
}

export function missingDependencies(key) {
  const m = MODULE_MAP.get(key);
  if (!m) return [];
  return (m.requires || []).filter((dep) => !isEnabled(dep));
}

export function dependants(key) {
  return MODULES.filter((m) => !m.core && (m.requires || []).includes(key) && isEnabled(m.key));
}

/**
 * Enable or disable a module.
 * Enabling fails when a dependency is off (readable error, no partial writes).
 * Disabling cascades to dependants so the app never advertises a capability
 * whose foundation is missing. Data is never touched.
 */
export function setModuleEnabled(key, on, { cascade = false } = {}) {
  const mod = MODULE_MAP.get(key);
  if (!mod) return { ok: false, error: "Unknown module." };
  if (mod.core) return { ok: false, error: `${mod.name} is part of the platform core and cannot be disabled.` };

  if (on) {
    const missing = missingDependencies(key);
    if (missing.length) {
      const names = missing.map((k) => MODULE_MAP.get(k)?.name || k).join(", ");
      return { ok: false, error: `${mod.name} needs ${names} enabled first.`, missing };
    }
  } else {
    const dependantsOn = dependants(key);
    if (dependantsOn.length && !cascade) {
      return {
        ok: false,
        error: `${mod.name} is used by ${dependantsOn.map((d) => d.name).join(", ")}. Disable those first, or confirm the cascade.`,
        dependants: dependantsOn.map((d) => d.key)
      };
    }
  }

  const disabled = [];
  db.prepare("UPDATE modules SET enabled = ?, updated_at = ? WHERE key = ?").run(on ? 1 : 0, nowIso(), key);
  if (!on && cascade) {
    const stack = [...dependants(key)];
    while (stack.length) {
      const m = stack.shift();
      if (!isEnabled(m.key)) continue;
      db.prepare("UPDATE modules SET enabled = 0, updated_at = ? WHERE key = ?").run(nowIso(), m.key);
      disabled.push(m.key);
      stack.push(...dependants(m.key));
    }
  }
  return { ok: true, disabled };
}

// Express guard. Site routes get a 404 page; admin routes get a readable notice.
export function requireModule(key) {
  return (req, res, next) => {
    if (isEnabled(key)) return next();
    const mod = MODULE_MAP.get(key);
    if (res.locals.admin) {
      return res.status(404).render?.("admin/disabled", { module: mod }) || res.status(404).send(`${mod?.name || key} is disabled.`);
    }
    res.status(404);
    if (req.accepts("html")) {
      return res.send(
        `<!doctype html><meta charset="utf-8"><title>Not available</title>` +
          `<p style="font-family:system-ui;padding:3rem">This part of the site is not available.</p>`
      );
    }
    res.json({ error: "Not available" });
  };
}

export function moduleSummary() {
  const mods = allModules();
  return {
    enabled: mods.filter((m) => m.enabled).map((m) => m.key),
    disabled: mods.filter((m) => !m.enabled).map((m) => m.key)
  };
}

// Modules that add a public navigation entry, in display order. Labels are
// resolved at render time so a restaurant can call products a menu.
export function publicNavModules() {
  return allModules().filter((m) => m.enabled && ["catalog", "services", "bookings", "inquiries"].includes(m.key));
}
