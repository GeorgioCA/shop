// Central configuration engine. One installation = one business, so there is a
// single configuration object, cached in memory and repainted on save.
//
// Rules:
//  - Every business value lives in `settings` as one JSON row per namespace.
//  - Reads never touch process.env at render time; env only seeds first boot.
//  - Unknown keys and invalid values are rejected, never silently stored.

import { db, settingRow, writeSetting } from "./db.js";
import { bool, emailOk, int, num, parseCents, str, nowIso } from "./util.js";

export const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"]
];

export const CURRENCIES = ["CAD", "USD", "GBP", "EUR", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "INR", "JPY", "ZAR", "AED", "SGD"];
export const LOCALES = ["en-CA", "en-US", "en-GB", "en-AU", "fr-CA", "fr-FR", "es-ES", "de-DE", "it-IT", "nl-NL", "pt-BR", "ja-JP"];

const DEFAULT_HOURS = {
  mon: { closed: false, open: "09:00", close: "17:00" },
  tue: { closed: false, open: "09:00", close: "17:00" },
  wed: { closed: false, open: "09:00", close: "17:00" },
  thu: { closed: false, open: "09:00", close: "17:00" },
  fri: { closed: false, open: "09:00", close: "17:00" },
  sat: { closed: true, open: "10:00", close: "16:00" },
  sun: { closed: true, open: "10:00", close: "16:00" }
};

/* --------------------------------- schema -------------------------------- */

const f = (type, label, extra = {}) => ({ type, label, ...extra });

export const SCHEMA = {
  business: {
    label: "Business identity",
    description: "How the business presents itself everywhere on the site and in email.",
    groups: ["Identity", "Contact", "Location", "Social"],
    fields: {
      name: f("text", "Business name", { group: "Identity", required: true, max: 120, default: "My Business" }),
      legalName: f("text", "Legal name", { group: "Identity", max: 160, default: "", help: "Shown in the footer and on invoices. Optional." }),
      tagline: f("text", "Tagline", { group: "Identity", max: 160, default: "", placeholder: "A short line under the name" }),
      description: f("textarea", "Description", { group: "Identity", max: 1200, rows: 3, default: "", help: "Used on the homepage, footer and SEO fallback." }),
      category: f("text", "Business category", { group: "Identity", max: 80, default: "", placeholder: "Bakery, Auto repair, Consultancy…" }),
      email: f("email", "Public email", { group: "Contact", default: "", placeholder: "hello@example.com" }),
      phone: f("text", "Phone", { group: "Contact", max: 40, default: "" }),
      address1: f("text", "Street address", { group: "Location", max: 160, default: "" }),
      address2: f("text", "Unit / suite", { group: "Location", max: 80, default: "" }),
      city: f("text", "City", { group: "Location", max: 80, default: "" }),
      region: f("text", "Province / state", { group: "Location", max: 80, default: "" }),
      postal: f("text", "Postal / ZIP code", { group: "Location", max: 20, default: "" }),
      country: f("text", "Country", { group: "Location", max: 80, default: "Canada" }),
      mapUrl: f("url", "Map link", { group: "Location", max: 500, default: "", help: "Google Maps or OpenStreetMap link. Optional." }),
      instagram: f("url", "Instagram", { group: "Social", max: 300, default: "" }),
      facebook: f("url", "Facebook", { group: "Social", max: 300, default: "" }),
      x: f("url", "X / Twitter", { group: "Social", max: 300, default: "" }),
      tiktok: f("url", "TikTok", { group: "Social", max: 300, default: "" }),
      linkedin: f("url", "LinkedIn", { group: "Social", max: 300, default: "" }),
      youtube: f("url", "YouTube", { group: "Social", max: 300, default: "" }),
      currency: f("enum", "Currency", { group: "Identity", values: CURRENCIES, default: "CAD" }),
      locale: f("enum", "Formatting locale", { group: "Identity", values: LOCALES, default: "en-CA" }),
      timezone: f("text", "Time zone", { group: "Identity", max: 64, default: "America/Edmonton", help: "IANA name, e.g. America/Toronto" })
    }
  },

  hours: {
    label: "Operating hours",
    description: "Used on the site, in booking slots and in the footer.",
    groups: ["Hours"],
    fields: {
      hours: { type: "hours", label: "Weekly hours", group: "Hours", default: DEFAULT_HOURS },
      note: f("text", "Hours note", { group: "Hours", max: 200, default: "", placeholder: "Holiday hours, walk-ins welcome…" })
    }
  },

  catalog: {
    label: "Catalog labels",
    description: "Industry language. A restaurant calls products a menu; a clinic calls services treatments.",
    groups: ["Labels", "Display"],
    fields: {
      productsLabel: f("text", "Products section label", { group: "Labels", max: 40, default: "Products" }),
      productSingular: f("text", "Product word", { group: "Labels", max: 40, default: "Product" }),
      servicesLabel: f("text", "Services section label", { group: "Labels", max: 40, default: "Services" }),
      serviceSingular: f("text", "Service word", { group: "Labels", max: 40, default: "Service" }),
      showPrices: f("bool", "Show prices", { group: "Display", default: true }),
      lowStockThreshold: f("int", "Low-stock alert threshold", { group: "Display", min: 0, max: 9999, default: 5 })
    }
  },

  theme: {
    label: "Appearance",
    description: "Colors, type and imagery. Changes are published immediately.",
    groups: ["Palette", "Typography", "Imagery"],
    fields: {
      preset: f("text", "Theme preset", { group: "Palette", max: 40, default: "modern" }),
      primary: f("color", "Primary", { group: "Palette", default: "#1f5c4a" }),
      primaryText: f("color", "Text on primary", { group: "Palette", default: "#ffffff" }),
      accent: f("color", "Accent", { group: "Palette", default: "#d97706" }),
      background: f("color", "Page background", { group: "Palette", default: "#fbfaf7" }),
      surface: f("color", "Card surface", { group: "Palette", default: "#ffffff" }),
      text: f("color", "Body text", { group: "Palette", default: "#1c1917" }),
      muted: f("color", "Muted text", { group: "Palette", default: "#6b6560" }),
      border: f("color", "Borders", { group: "Palette", default: "#e7e2d9" }),
      headingFont: f("enum", "Heading font", { group: "Typography", values: ["sans", "serif", "rounded", "mono"], default: "serif" }),
      bodyFont: f("enum", "Body font", { group: "Typography", values: ["sans", "serif", "rounded", "mono"], default: "sans" }),
      radius: f("enum", "Corner style", { group: "Typography", values: ["sharp", "soft", "round"], default: "soft" }),
      logo: f("media", "Logo", { group: "Imagery", default: "", help: "PNG or SVG, ideally on a transparent background." }),
      favicon: f("media", "Favicon", { group: "Imagery", default: "" }),
      heroImage: f("media", "Default hero image", { group: "Imagery", default: "", help: "Used by hero sections that have no image of their own." }),
      ogImage: f("media", "Social share image", { group: "Imagery", default: "" })
    }
  },

  site: {
    label: "Website",
    description: "Announcements, footer and default SEO.",
    groups: ["Header", "Footer", "SEO"],
    fields: {
      announcement: f("text", "Announcement bar", { group: "Header", max: 200, default: "", help: "Leave empty to hide the bar." }),
      announcementUrl: f("url", "Announcement link", { group: "Header", max: 300, default: "" }),
      ctaLabel: f("text", "Header call-to-action", { group: "Header", max: 40, default: "" }),
      ctaUrl: f("url", "Header CTA link", { group: "Header", max: 300, default: "" }),
      footerText: f("textarea", "Footer text", { group: "Footer", max: 600, rows: 3, default: "" }),
      seoTitle: f("text", "Default page title", { group: "SEO", max: 120, default: "" }),
      seoDescription: f("textarea", "Default meta description", { group: "SEO", max: 300, rows: 2, default: "" })
    }
  },

  commerce: {
    label: "Orders & payments",
    description: "Checkout, fulfilment, tax and payment rules.",
    groups: ["Checkout", "Pickup", "Delivery", "Payment", "Tax"],
    fields: {
      minOrderCents: f("money", "Minimum order", { group: "Checkout", min: 0, default: 0 }),
      requirePhone: f("bool", "Require a phone number", { group: "Checkout", default: false }),
      allowOrderNotes: f("bool", "Allow order notes", { group: "Checkout", default: true }),
      orderPrefix: f("text", "Order number prefix", { group: "Checkout", max: 8, default: "ORD-" }),
      pickupEnabled: f("bool", "Offer pickup", { group: "Pickup", default: true }),
      pickupInstructions: f("textarea", "Pickup instructions", { group: "Pickup", max: 600, rows: 2, default: "We'll email you when your order is ready." }),
      deliveryEnabled: f("bool", "Offer delivery", { group: "Delivery", default: false }),
      deliveryFeeCents: f("money", "Delivery fee", { group: "Delivery", min: 0, default: 0 }),
      deliveryFreeOverCents: f("money", "Free delivery over", { group: "Delivery", min: 0, default: 0, help: "0 disables the threshold." }),
      deliveryArea: f("text", "Delivery area", { group: "Delivery", max: 160, default: "" }),
      deliveryInstructions: f("textarea", "Delivery instructions", { group: "Delivery", max: 600, rows: 2, default: "" }),
      onlinePayments: f("bool", "Accept card payments", { group: "Payment", default: false, help: "Requires STRIPE_SECRET_KEY in the environment." }),
      offlinePayments: f("bool", "Offer pay-later / in person", { group: "Payment", default: true }),
      offlineLabel: f("text", "Pay-later label", { group: "Payment", max: 60, default: "Pay in person" }),
      offlineInstructions: f("textarea", "Pay-later instructions", { group: "Payment", max: 600, rows: 2, default: "We'll confirm your order and payment details by email." }),
      tipsEnabled: f("bool", "Offer tips", { group: "Checkout", default: false }),
      tipPresets: f("text", "Tip percentages", { group: "Checkout", max: 40, default: "5, 10, 15", help: "Comma-separated, e.g. 10, 15, 20" }),
      taxRatePct: f("decimal", "Tax rate (%)", { group: "Tax", min: 0, max: 40, default: 0 }),
      taxLabel: f("text", "Tax label", { group: "Tax", max: 30, default: "Tax" }),
      taxDelivery: f("bool", "Tax delivery fees", { group: "Tax", default: false })
    }
  },

  bookings: {
    label: "Bookings",
    description: "How appointment slots are offered and confirmed.",
    groups: ["Scheduling", "Rules"],
    fields: {
      slotIntervalMin: f("int", "Slot interval (minutes)", { group: "Scheduling", min: 5, max: 120, default: 30 }),
      leadHours: f("int", "Minimum notice (hours)", { group: "Rules", min: 0, max: 720, default: 4 }),
      maxAdvanceDays: f("int", "Book up to (days ahead)", { group: "Rules", min: 1, max: 365, default: 60 }),
      confirmationMode: f("enum", "Confirmation", { group: "Rules", values: ["auto", "manual"], default: "auto", help: "Manual holds requests as pending until you confirm." }),
      requirePhone: f("bool", "Require a phone number", { group: "Rules", default: true }),
      allowStaffChoice: f("bool", "Let customers choose a staff member", { group: "Scheduling", default: false }),
      bookingPrefix: f("text", "Booking number prefix", { group: "Scheduling", max: 8, default: "BK-" }),
      closedMessage: f("text", "Message when no slots are available", { group: "Rules", max: 200, default: "No times available — please contact us." })
    }
  },

  email: {
    label: "Email notifications",
    description: "Transactional email. Sending is skipped when RESEND_API_KEY is unset.",
    groups: ["Notifications"],
    fields: {
      fromName: f("text", "From name", { group: "Notifications", max: 80, default: "" }),
      fromEmail: f("email", "From address", { group: "Notifications", max: 160, default: "", help: "Must be on a domain verified with your email provider." }),
      replyTo: f("email", "Reply-to", { group: "Notifications", max: 160, default: "" }),
      ownerEmail: f("email", "Owner alert address", { group: "Notifications", max: 160, default: "", help: "New orders, bookings and inquiries. Empty disables alerts." }),
      orderConfirmation: f("bool", "Send order confirmations", { group: "Notifications", default: true }),
      bookingConfirmation: f("bool", "Send booking confirmations", { group: "Notifications", default: true }),
      inquiryAcknowledgement: f("bool", "Acknowledge inquiries", { group: "Notifications", default: true })
    }
  },

  setup: {
    label: "Setup",
    description: "Onboarding state. Managed by the setup wizard.",
    groups: ["Setup"],
    fields: {
      completed: f("bool", "Setup completed", { group: "Setup", default: false }),
      preset: f("text", "Applied preset", { group: "Setup", max: 40, default: "" }),
      completedAt: f("text", "Completed at", { group: "Setup", max: 40, default: "" })
    }
  }
};

/* -------------------------------- coercion -------------------------------- */

const isWebUrl = (v) => /^(https?:\/\/|mailto:|tel:|\/)/i.test(v);

function coerceOne(field, value, key) {
  switch (field.type) {
    case "text":
    case "textarea":
      return str(value, field.max ?? 5000);
    case "email": {
      const v = str(value, 160).toLowerCase();
      if (v && !emailOk(v)) throw new Error(`${field.label} must be a valid email address.`);
      return v;
    }
    case "url": {
      const v = str(value, field.max ?? 500);
      if (v && !isWebUrl(v)) throw new Error(`${field.label} must start with http://, https:// or /.`);
      return v;
    }
    case "color": {
      const v = str(value, 7).toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(v)) throw new Error(`${field.label} must be a hex colour like #1f5c4a.`);
      return v;
    }
    case "enum": {
      const v = str(value, 60);
      if (!field.values.includes(v)) throw new Error(`${field.label} must be one of: ${field.values.join(", ")}.`);
      return v;
    }
    case "int":
      return int(value, { min: field.min ?? -1e9, max: field.max ?? 1e9, fallback: field.default ?? 0 });
    case "money": {
      if (typeof value === "number" && Number.isInteger(value)) {
        return Math.max(field.min ?? 0, value);
      }
      const cents = parseCents(value);
      return Math.max(field.min ?? 0, cents ?? field.default ?? 0);
    }
    case "decimal":
      return num(value, { min: field.min ?? 0, max: field.max ?? 1e9, fallback: field.default ?? 0 });
    case "bool":
      return bool(value) ? 1 : 0;
    case "media":
      return str(value, 300);
    case "hours": {
      const out = {};
      for (const [day] of DAYS) {
        const src = value?.[day] ?? {};
        const open = /^\d{2}:\d{2}$/.test(String(src.open)) ? String(src.open) : (field.default?.[day]?.open ?? "09:00");
        const close = /^\d{2}:\d{2}$/.test(String(src.close)) ? String(src.close) : (field.default?.[day]?.close ?? "17:00");
        out[day] = { closed: bool(src.closed) ? 1 : 0, open, close };
      }
      return out;
    }
    case "json":
      return value;
    default:
      return str(value, 500);
  }
}

export function coerceFields(namespace, input = {}) {
  const ns = SCHEMA[namespace];
  if (!ns) throw new Error(`Unknown settings namespace: ${namespace}`);
  const out = {};
  for (const [key, field] of Object.entries(ns.fields)) {
    if (!(key in input)) continue;
    const value = coerceOne(field, input[key], key);
    if (field.required && !value) throw new Error(`${field.label} is required.`);
    out[key] = value;
  }
  return out;
}

export function defaultsFor(namespace) {
  const ns = SCHEMA[namespace];
  const out = {};
  for (const [key, field] of Object.entries(ns.fields)) {
    out[key] = field.type === "hours" ? JSON.parse(JSON.stringify(field.default)) : field.default;
  }
  return out;
}

/* --------------------------------- runtime -------------------------------- */

const NAMESPACES = Object.keys(SCHEMA);
let cache = null;

function envSeed() {
  const seed = {};
  const map = {
    BUSINESS_NAME: ["business", "name"],
    BUSINESS_TAGLINE: ["business", "tagline"],
    BUSINESS_EMAIL: ["business", "email"],
    BUSINESS_PHONE: ["business", "phone"],
    BUSINESS_CURRENCY: ["business", "currency"],
    BUSINESS_TIMEZONE: ["business", "timezone"]
  };
  for (const [envKey, [ns, field]] of Object.entries(map)) {
    if (process.env[envKey]) {
      seed[ns] ??= {};
      seed[ns][field] = process.env[envKey];
    }
  }
  return seed;
}

export function loadConfig() {
  const seed = envSeed();
  const out = {};
  for (const ns of NAMESPACES) {
    const stored = settingRow(ns) || {};
    out[ns] = { ...defaultsFor(ns), ...stored };
    if (seed[ns]) {
      // Environment seeds a name only before the business has ever been configured.
      if (!out.setup?.completed) out[ns] = { ...out[ns], ...seed[ns] };
    }
  }
  // Guard against a hand-edited JSON row producing a broken render.
  for (const ns of NAMESPACES) {
    for (const [key, field] of Object.entries(SCHEMA[ns].fields)) {
      try {
        out[ns][key] = coerceOne(field, out[ns][key], key);
      } catch {
        out[ns][key] = field.type === "hours" ? JSON.parse(JSON.stringify(field.default)) : field.default;
      }
    }
  }
  cache = out;
  return out;
}

export function config() {
  return cache || loadConfig();
}

export function saveConfig(namespace, patch, { reload = true } = {}) {
  const clean = coerceFields(namespace, patch);
  const current = settingRow(namespace) || {};
  const next = { ...current, ...clean };
  writeSetting(namespace, next);
  if (reload) loadConfig();
  return next;
}

export function saveNamespaceObject(namespace, value) {
  writeSetting(namespace, value);
  loadConfig();
}

export const isSetupComplete = () => !!config().setup.completed;

export function markSetupComplete(preset = "") {
  saveConfig("setup", { completed: 1, preset, completedAt: nowIso() });
}

/* Convenience accessors used across views/routes. */
export const moneyFormat = (cents) => {
  const { currency, locale } = config().business;
  return { cents, currency, locale };
};

export function businessAddressLines() {
  const b = config().business;
  return [b.address1, b.address2, [b.city, b.region, b.postal].filter(Boolean).join(", "), b.country]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}

export function socialLinks() {
  const b = config().business;
  return [
    ["Instagram", b.instagram],
    ["Facebook", b.facebook],
    ["X", b.x],
    ["TikTok", b.tiktok],
    ["LinkedIn", b.linkedin],
    ["YouTube", b.youtube]
  ].filter(([, url]) => !!url);
}

export function openDays() {
  return DAYS.filter(([key]) => !config().hours.hours[key]?.closed);
}

export function todayHours(tz = config().business.timezone) {
  const idx = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
  const map = { Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun" };
  const key = map[idx] || "mon";
  return { key, ...config().hours.hours[key] };
}

export function currencySymbol() {
  try {
    return new Intl.NumberFormat(config().business.locale, { style: "currency", currency: config().business.currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value || "$";
  } catch {
    return "$";
  }
}

export function taxRate() {
  return num(config().commerce.taxRatePct, { min: 0, max: 40, fallback: 0 }) / 100;
}

export function tipPresets() {
  return String(config().commerce.tipPresets || "")
    .split(/[,\s]+/)
    .map((s) => Number(String(s).replace("%", "")))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 50)
    .map((n) => Math.round(n))
    .slice(0, 4);
}

export function allSettings() {
  return config();
}
