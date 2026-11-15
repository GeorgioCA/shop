// Section registry: one definition drives both the admin editor and the
// renderer. A section is an ordered, typed block of content — not a page builder.

import { str, int, bool, listFromLines } from "../core/util.js";

const F = (type, label, extra = {}) => ({ type, label, ...extra });

export const SECTION_TYPES = {
  hero: {
    label: "Hero",
    description: "Large opening block with headline, copy, image and buttons.",
    icon: "layout",
    fields: {
      eyebrow: F("text", "Eyebrow", { max: 60, default: "" }),
      title: F("text", "Headline", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 400, rows: 2, default: "" }),
      image: F("media", "Image", { default: "" }),
      ctaLabel: F("text", "Button label", { max: 40, default: "" }),
      ctaUrl: F("url", "Button link", { max: 300, default: "" }),
      cta2Label: F("text", "Second button label", { max: 40, default: "" }),
      cta2Url: F("url", "Second button link", { max: 300, default: "" }),
      align: F("enum", "Alignment", { values: ["left", "center"], default: "left" }),
      tall: F("bool", "Tall hero", { default: true })
    },
    defaults: { align: "left", tall: 1 }
  },
  image_text: {
    label: "Image + text",
    description: "A story block with an image on one side.",
    icon: "image",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 1200, rows: 3, default: "" }),
      image: F("media", "Image", { default: "" }),
      side: F("enum", "Image side", { values: ["right", "left"], default: "right" }),
      ctaLabel: F("text", "Button label", { max: 40, default: "" }),
      ctaUrl: F("url", "Button link", { max: 300, default: "" }),
      eyebrow: F("text", "Eyebrow", { max: 60, default: "" })
    },
    defaults: { side: "right" }
  },
  rich_text: {
    label: "Text block",
    description: "Headline and prose. Blank lines become paragraphs.",
    icon: "edit",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 8000, rows: 6, default: "" }),
      align: F("enum", "Alignment", { values: ["left", "center"], default: "left" }),
      narrow: F("bool", "Narrow column", { default: true })
    },
    defaults: { align: "left", narrow: 1 }
  },
  product_grid: {
    label: "Product grid",
    description: "Products from the catalog, optionally from one category.",
    icon: "box",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 300, rows: 2, default: "" }),
      categoryId: F("category", "Category", { kind: "product", default: "" }),
      limit: F("int", "Maximum items", { min: 1, max: 24, default: 6 }),
      columns: F("enum", "Columns", { values: ["2", "3", "4"], default: "3" }),
      featuredOnly: F("bool", "Featured only", { default: 0 }),
      ctaLabel: F("text", "Button label", { max: 40, default: "" }),
      ctaUrl: F("url", "Button link", { max: 300, default: "" })
    },
    defaults: { limit: 6, columns: "3", featuredOnly: 0 }
  },
  menu_list: {
    label: "Menu list",
    description: "Compact price list grouped by category — menus, service lists, price sheets.",
    icon: "tag",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 300, rows: 2, default: "" }),
      categoryId: F("category", "Category", { kind: "product", default: "" }),
      showDescriptions: F("bool", "Show descriptions", { default: 1 })
    },
    defaults: { showDescriptions: 1 }
  },
  service_grid: {
    label: "Service grid",
    description: "Services from the catalog with prices and durations.",
    icon: "clock",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 300, rows: 2, default: "" }),
      limit: F("int", "Maximum items", { min: 1, max: 24, default: 6 }),
      columns: F("enum", "Columns", { values: ["2", "3"], default: "3" }),
      ctaLabel: F("text", "Button label", { max: 40, default: "Book" }),
      ctaUrl: F("url", "Button link", { max: 300, default: "/book" })
    },
    defaults: { limit: 6, columns: "3", ctaLabel: "Book", ctaUrl: "/book" }
  },
  feature_list: {
    label: "Feature list",
    description: "A row of short reasons, steps or benefits.",
    icon: "grid",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 300, rows: 2, default: "" }),
      items: F("pairs", "Items", { default: "", help: "One per line: Title | Description" })
    },
    defaults: {}
  },
  stats: {
    label: "Stats",
    description: "Two to four headline numbers.",
    icon: "chart",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      items: F("pairs", "Stats", { default: "", help: "One per line: 12 years | Serving Calgary" })
    },
    defaults: {}
  },
  gallery: {
    label: "Gallery",
    description: "A grid of images from the media library.",
    icon: "image",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 300, rows: 2, default: "" }),
      images: F("lines", "Images", { default: "", help: "One image filename or URL per line" }),
      columns: F("enum", "Columns", { values: ["2", "3", "4"], default: "3" })
    },
    defaults: { columns: "3" }
  },
  testimonials: {
    label: "Testimonials",
    description: "Approved testimonials from the back office.",
    icon: "star",
    fields: {
      title: F("text", "Heading", { max: 140, default: "What people say" }),
      text: F("textarea", "Text", { max: 300, rows: 2, default: "" }),
      limit: F("int", "Maximum", { min: 1, max: 12, default: 3 })
    },
    defaults: { title: "What people say", limit: 3 }
  },
  faq: {
    label: "FAQ",
    description: "Questions from the FAQ list.",
    icon: "help",
    fields: {
      title: F("text", "Heading", { max: 140, default: "Common questions" }),
      text: F("textarea", "Text", { max: 300, rows: 2, default: "" }),
      limit: F("int", "Maximum", { min: 1, max: 20, default: 6 })
    },
    defaults: { title: "Common questions", limit: 6 }
  },
  cta: {
    label: "Call to action",
    description: "A focused block with one button.",
    icon: "arrow",
    fields: {
      title: F("text", "Heading", { max: 140, default: "" }),
      text: F("textarea", "Text", { max: 400, rows: 2, default: "" }),
      ctaLabel: F("text", "Button label", { max: 40, default: "" }),
      ctaUrl: F("url", "Button link", { max: 300, default: "" }),
      tone: F("enum", "Tone", { values: ["primary", "surface", "accent"], default: "primary" })
    },
    defaults: { tone: "primary" }
  },
  booking_cta: {
    label: "Booking prompt",
    description: "Availability prompt with a link to the booking page.",
    icon: "calendar",
    fields: {
      title: F("text", "Heading", { max: 140, default: "Book an appointment" }),
      text: F("textarea", "Text", { max: 400, rows: 2, default: "" }),
      ctaLabel: F("text", "Button label", { max: 40, default: "See available times" }),
      ctaUrl: F("url", "Button link", { max: 300, default: "/book" })
    },
    defaults: { title: "Book an appointment", ctaLabel: "See available times", ctaUrl: "/book" }
  },
  contact_hours: {
    label: "Contact & hours",
    description: "Address, phone, email and the weekly schedule.",
    icon: "pin",
    fields: {
      title: F("text", "Heading", { max: 140, default: "Visit us" }),
      text: F("textarea", "Text", { max: 400, rows: 2, default: "" }),
      showHours: F("bool", "Show hours", { default: 1 }),
      showMap: F("bool", "Show map link", { default: 1 })
    },
    defaults: { title: "Visit us", showHours: 1, showMap: 1 }
  },
  banner: {
    label: "Banner",
    description: "A slim promotional strip.",
    icon: "tag",
    fields: {
      text: F("text", "Text", { max: 200, default: "" }),
      ctaLabel: F("text", "Button label", { max: 40, default: "" }),
      ctaUrl: F("url", "Button link", { max: 300, default: "" }),
      image: F("media", "Background image", { default: "" })
    },
    defaults: {}
  }
};

export const SECTION_CHOICES = Object.entries(SECTION_TYPES).map(([key, def]) => ({
  key,
  label: def.label,
  description: def.description,
  icon: def.icon
}));

export function defaultsFor(type) {
  const def = SECTION_TYPES[type];
  if (!def) return null;
  const out = { type, id: "" };
  for (const [key, field] of Object.entries(def.fields)) {
    out[key] = def.defaults?.[key] ?? field.default ?? "";
  }
  return out;
}

export function normalizeSection(input) {
  const type = String(input?.type || "");
  const def = SECTION_TYPES[type];
  if (!def) throw new Error(`Unknown section type: ${type || "(blank)"}`);
  const out = { type, id: str(input.id, 40) || `s_${Math.random().toString(36).slice(2, 9)}` };
  for (const [key, field] of Object.entries(def.fields)) {
    const value = input[key];
    switch (field.type) {
      case "int": out[key] = int(value, { min: field.min ?? 0, max: field.max ?? 9999, fallback: field.default ?? 0 }); break;
      case "bool": out[key] = bool(value) ? 1 : 0; break;
      case "enum":
        out[key] = field.values.includes(String(value)) ? String(value) : field.default;
        break;
      case "pairs": out[key] = str(value, 4000); break;
      case "lines": out[key] = listFromLines(str(value, 4000)).slice(0, 24).join("\n"); break;
      default: out[key] = str(value, field.max ?? 500);
    }
  }
  return out;
}

export function normalizeSections(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 40).map((s) => {
    try { return normalizeSection(s); } catch { return null; }
  }).filter(Boolean);
}

// Form body -> section object. The editor posts flat field names per section.
export function sectionFromForm(type, body) {
  const def = SECTION_TYPES[type];
  if (!def) throw new Error("Choose a section type.");
  const input = { type, id: body.section_id || undefined };
  for (const key of Object.keys(def.fields)) input[key] = body[key];
  return normalizeSection(input);
}
