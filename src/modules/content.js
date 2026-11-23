// Pages, ordered sections, navigation, FAQs and testimonials.

import { db, insert, update, jsonParse } from "../core/db.js";
import { id, nowIso, str, int, bool, slugify, uniqueSlug, urlOk } from "../core/util.js";
import { normalizeSections, normalizeSection, SECTION_TYPES } from "../content/sections.js";

/* --------------------------------- pages ---------------------------------- */

export const pageUrl = (page) => (!page ? "/" : page.is_home ? "/" : `/p/${page.slug}`);

export function listPages() {
  return db.prepare("SELECT * FROM pages ORDER BY is_home DESC, updated_at DESC").all().map(hydratePage);
}

export function hydratePage(row) {
  return row ? { ...row, sections: normalizeSections(jsonParse(row.sections, [])) } : null;
}

export function getPage(identifier) {
  const row = db.prepare("SELECT * FROM pages WHERE id = ? OR slug = ?").get(String(identifier || ""), String(identifier || ""));
  return hydratePage(row);
}

export function homePage() {
  return hydratePage(db.prepare("SELECT * FROM pages WHERE is_home = 1 LIMIT 1").get()) || null;
}

export function publishedPages() {
  return db.prepare("SELECT * FROM pages WHERE status = 'published' ORDER BY title").all().map(hydratePage);
}

export function savePage(input) {
  const existing = input.id ? getPage(input.id) : null;
  const title = str(input.title, 160);
  if (!title) throw new Error("Give the page a title.");
  const isHome = bool(input.is_home) ? 1 : 0;
  let slug;
  if (isHome) {
    slug = "home";
  } else {
    const taken = (s) => !!db.prepare("SELECT 1 FROM pages WHERE slug = ? AND id != ?").get(s, existing?.id || "");
    slug = existing && existing.title === title && existing.slug !== "home" ? existing.slug : uniqueSlug(input.slug || title, taken);
  }
  const row = {
    slug,
    title,
    status: input.status === "published" ? "published" : "draft",
    seo_title: str(input.seo_title, 160),
    seo_description: str(input.seo_description, 300),
    seo_image: str(input.seo_image, 300) || null,
    is_home: isHome,
    updated_at: nowIso()
  };

  let pageId;
  if (existing) {
    if (isHome && existing.is_home !== 1) db.prepare("UPDATE pages SET is_home = 0").run();
    if (!isHome && existing.is_home === 1) {
      // Never leave the site without a homepage.
      db.prepare("UPDATE pages SET is_home = 0 WHERE id != ?").run(existing.id);
    }
    update("pages", existing.id, row);
    pageId = existing.id;
  } else {
    if (isHome) db.prepare("UPDATE pages SET is_home = 0").run();
    pageId = id("pg_");
    insert("pages", {
      id: pageId,
      ...row,
      sections: JSON.stringify(input.sections ? normalizeSections(input.sections) : []),
      created_at: nowIso()
    });
  }
  return getPage(pageId);
}

export function deletePage(pageId) {
  const page = getPage(pageId);
  if (!page) throw new Error("Page not found.");
  if (page.is_home) throw new Error("The homepage cannot be deleted. Make another page the homepage first.");
  db.prepare("DELETE FROM pages WHERE id = ?").run(page.id);
}

export function setPageStatus(pageId, status) {
  db.prepare("UPDATE pages SET status = ?, updated_at = ? WHERE id = ?").run(status === "published" ? "published" : "draft", nowIso(), pageId);
}

export function updatePageSections(pageId, sections) {
  const clean = normalizeSections(sections);
  db.prepare("UPDATE pages SET sections = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(clean), nowIso(), pageId);
  return clean;
}

export function addSection(pageId, type) {
  const page = getPage(pageId);
  if (!page) throw new Error("Page not found.");
  if (!SECTION_TYPES[type]) throw new Error("Choose a section type.");
  return updatePageSections(pageId, [...page.sections, { type, id: id("s_") }]);
}

export function saveSection(pageId, sectionId, data) {
  const page = getPage(pageId);
  if (!page) throw new Error("Page not found.");
  const clean = normalizeSection({ ...data, id: sectionId, type: data.type });
  const sections = page.sections.map((s) => (s.id === sectionId ? clean : s));
  updatePageSections(pageId, sections);
  return clean;
}

export function moveSection(pageId, sectionId, direction) {
  const page = getPage(pageId);
  if (!page) throw new Error("Page not found.");
  const idx = page.sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= page.sections.length) return;
  const next = [...page.sections];
  [next[idx], next[target]] = [next[target], next[idx]];
  updatePageSections(pageId, next);
}

export function removeSection(pageId, sectionId) {
  const page = getPage(pageId);
  if (!page) return;
  updatePageSections(pageId, page.sections.filter((s) => s.id !== sectionId));
}

/* ----------------------------------- nav ---------------------------------- */

export function listNav(location = null) {
  return location
    ? db.prepare("SELECT * FROM nav_items WHERE location = ? ORDER BY sort, label").all(location)
    : db.prepare("SELECT * FROM nav_items ORDER BY location, sort, label").all();
}

export function saveNavItem(input) {
  const label = str(input.label, 60);
  const url = str(input.url, 300);
  if (!label || !url) throw new Error("A link needs a label and a URL.");
  // Nav links render as href attributes; without this a content editor could
  // save javascript: or a protocol-relative redirect.
  if (!urlOk(url)) throw new Error("The link must start with http://, https://, mailto:, tel: or /.");
  const row = {
    location: input.location === "footer" ? "footer" : "header",
    label,
    url,
    sort: int(input.sort, { min: 0, max: 9999, fallback: 100 }),
    visible: bool(input.visible ?? 1) ? 1 : 0,
    parent_id: null
  };
  if (input.id) { update("nav_items", input.id, row); return input.id; }
  const newId = id("nav_");
  insert("nav_items", { id: newId, ...row });
  return newId;
}

export function deleteNavItem(navId) {
  db.prepare("DELETE FROM nav_items WHERE id = ?").run(navId);
}

/* ---------------------------------- FAQs ---------------------------------- */

export function listFaqs({ activeOnly = false } = {}) {
  return db.prepare(`SELECT * FROM faqs ${activeOnly ? "WHERE active = 1" : ""} ORDER BY sort, question`).all();
}

export function saveFaq(input) {
  const question = str(input.question, 300);
  const answer = str(input.answer, 3000);
  if (!question || !answer) throw new Error("A FAQ needs a question and an answer.");
  const row = { question, answer, sort: int(input.sort, { fallback: 100 }), active: bool(input.active ?? 1) ? 1 : 0 };
  if (input.id) { update("faqs", input.id, row); return input.id; }
  const newId = id("faq_");
  insert("faqs", { id: newId, ...row });
  return newId;
}

export function deleteFaq(faqId) {
  db.prepare("DELETE FROM faqs WHERE id = ?").run(faqId);
}

/* ------------------------------- testimonials ----------------------------- */

export function listTestimonials({ activeOnly = false } = {}) {
  return db.prepare(`SELECT * FROM testimonials ${activeOnly ? "WHERE active = 1" : ""} ORDER BY sort, id DESC`).all();
}

export function saveTestimonial(input) {
  const author = str(input.author, 120);
  const quote = str(input.quote, 1000);
  if (!author || !quote) throw new Error("A testimonial needs an author and a quote.");
  const row = {
    author,
    role: str(input.role, 120),
    quote,
    rating: int(input.rating, { min: 1, max: 5, fallback: 5 }),
    image: str(input.image, 300) || null,
    sort: int(input.sort, { fallback: 100 }),
    active: bool(input.active ?? 1) ? 1 : 0
  };
  if (input.id) { update("testimonials", input.id, row); return input.id; }
  const newId = id("ts_");
  insert("testimonials", { id: newId, ...row });
  return newId;
}

export function deleteTestimonial(testimonialId) {
  db.prepare("DELETE FROM testimonials WHERE id = ?").run(testimonialId);
}

/* -------------------------------- sitemap --------------------------------- */

export function sitemapEntries() {
  const out = [{ url: "/", changefreq: "weekly", priority: "1.0" }];
  for (const p of publishedPages()) if (!p.is_home) out.push({ url: `/p/${p.slug}`, changefreq: "monthly", priority: "0.7" });
  for (const p of db.prepare("SELECT slug, updated_at FROM products WHERE active = 1").all()) {
    out.push({ url: `/product/${p.slug}`, changefreq: "weekly", priority: "0.8", lastmod: p.updated_at?.slice(0, 10) });
  }
  for (const s of db.prepare("SELECT slug, updated_at FROM services WHERE active = 1").all()) {
    out.push({ url: `/services/${s.slug}`, changefreq: "monthly", priority: "0.8", lastmod: s.updated_at?.slice(0, 10) });
  }
  return out;
}

export { slugify };
