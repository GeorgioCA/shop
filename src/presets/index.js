// Applying a preset writes ordinary records through the same APIs the admin
// uses. Nothing here is a mode switch; every value remains editable afterwards.

import { db } from "../core/db.js";
import { saveConfig, markSetupComplete, config } from "../core/config.js";
import { MODULES, MODULE_MAP } from "../core/modules.js";
import { nowIso } from "../core/util.js";
import { PRESETS, PRESET_GROUPS, THEMES, presetList } from "./data.js";
import { listCategories, saveCategory, saveProduct, listProducts } from "../modules/catalog.js";
import { saveService, listServices } from "../modules/services.js";
import { savePage, getPage, homePage, updatePageSections, listFaqs, saveFaq, listTestimonials, saveTestimonial, listNav, saveNavItem } from "../modules/content.js";

export { PRESETS, PRESET_GROUPS, THEMES, presetList };

export function presetMeta(key) {
  const p = PRESETS[key];
  if (!p) return null;
  return {
    key,
    name: p.business.name,
    category: p.business.category,
    tagline: p.business.tagline,
    description: p.business.description,
    theme: p.theme,
    modules: p.modules,
    counts: { products: p.products.length, services: p.services.length, pages: p.pages.length + 1 }
  };
}

/**
 * Apply a preset.
 *  - Always rewrites business identity, theme, hours, labels and module selection.
 *  - Homepage sections are replaced only when `replaceHome` is true (default on
 *    first setup; the admin can turn it off when re-applying a preset).
 *  - Catalog and FAQ/testimonial content are seeded only into an empty store or
 *    when `seedCatalog` is explicitly requested.
 */
export function applyPreset(key, { seedCatalog = null, replaceHome = true, seedContent = null } = {}) {
  const preset = PRESETS[key];
  if (!preset) throw new Error("Unknown industry preset.");
  const current = config();
  const emptyCatalog = listProducts().length === 0 && listServices().length === 0;
  const shouldSeed = seedCatalog === null ? emptyCatalog : !!seedCatalog;
  const shouldSeedContent = seedContent === null ? emptyCatalog : !!seedContent;

  /* identity */
  saveConfig("business", {
    name: preset.business.name,
    tagline: preset.business.tagline,
    description: preset.business.description,
    category: preset.business.category,
    email: preset.business.email,
    city: preset.business.city,
    region: preset.business.region,
    country: preset.business.country,
    timezone: preset.business.timezone,
    currency: preset.business.currency,
    locale: preset.business.locale
  });
  saveConfig("theme", preset.theme);
  saveConfig("hours", { hours: preset.hours });
  saveConfig("catalog", preset.catalog);
  saveConfig("site", preset.site || {});
  saveConfig("commerce", { orderPrefix: "ORD-", ...preset.commerce });
  saveConfig("bookings", preset.bookings || {});

  /* modules: preset list + any required dependency, everything else off */
  const wanted = new Set(["content"]);
  const addWithDeps = (k) => {
    const m = MODULE_MAP.get(k);
    if (!m) return;
    for (const dep of m.requires || []) addWithDeps(dep);
    wanted.add(k);
  };
  for (const k of preset.modules) addWithDeps(k);
  for (const m of MODULES) {
    if (m.core) continue;
    db.prepare("UPDATE modules SET enabled = ?, updated_at = ? WHERE key = ?").run(wanted.has(m.key) ? 1 : 0, nowIso(), m.key);
  }

  /* navigation */
  db.prepare("DELETE FROM nav_items").run();
  for (const item of preset.nav) {
    saveNavItem({ ...item, visible: 1 });
  }

  /* pages */
  const home = homePage();
  if (!home) {
    const page = savePage({ title: "Home", slug: "home", status: "published", is_home: 1, sections: preset.home });
    if (!page.sections.length) updatePageSections(page.id, preset.home);
  } else if (replaceHome) {
    updatePageSections(home.id, preset.home);
    db.prepare("UPDATE pages SET status = 'published', updated_at = ? WHERE id = ?").run(nowIso(), home.id);
  }
  for (const p of preset.pages) {
    if (getPage(p.slug)) continue;
    savePage({ title: p.title, slug: p.slug, status: p.status || "published", sections: p.sections || [] });
  }

  /* catalog */
  if (shouldSeed) {
    const catIds = {};
    for (const kind of ["product", "service"]) {
      for (const c of preset.categories.filter((x) => (x.kind || "product") === kind)) {
        const existing = listCategories(kind).find((x) => x.name.toLowerCase() === c.name.toLowerCase());
        const row = existing || saveCategory({ kind, name: c.name, description: c.description || "" });
        catIds[`${kind}:${c.name}`] = row.id;
      }
    }
    for (const p of preset.products) {
      if (db.prepare("SELECT 1 FROM products WHERE name = ?").get(p.name)) continue;
      saveProduct({
        name: p.name,
        price: p.price,
        sale_price: p.sale_price || "",
        short_desc: p.desc || "",
        description: p.description || p.desc || "",
        category_id: catIds[`product:${p.category}`] || null,
        featured: p.featured ? 1 : 0,
        track_stock: 0,
        stock: p.stock ?? 0,
        max_per_order: 12,
        active: 1,
        attributes: p.attributes || "",
        variant_group: p.variant_group || "",
        variant_options: p.variant_options || "",
        sort: (preset.products.indexOf(p) + 1) * 10
      });
    }
    for (const s of preset.services) {
      saveService({
        name: s.name,
        price: s.price,
        duration_min: s.duration,
        short_desc: s.desc || "",
        description: s.description || s.desc || "",
        category_id: catIds[`service:${s.category}`] || null,
        price_type: s.price_type || "fixed",
        featured: 1,
        active: 1,
        sort: (preset.services.indexOf(s) + 1) * 10
      });
    }
  }

  /* editorial content */
  if (shouldSeedContent) {
    if (listFaqs().length === 0) for (const f of preset.faqs || []) saveFaq({ question: f.question, answer: f.answer, active: 1 });
    if (listTestimonials().length === 0) for (const t of preset.testimonials || []) saveTestimonial({ author: t.author, role: t.role, quote: t.quote, rating: 5, active: 1 });
  }

  markSetupComplete(key);
  return {
    ok: true,
    preset: key,
    modules: [...wanted],
    seededCatalog: shouldSeed,
    seededContent: shouldSeedContent
  };
}
