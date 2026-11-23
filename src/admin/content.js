// Admin: pages, sections, navigation and editorial content.

import express from "express";
import { requireAuth, requirePermission, verifyCsrf } from "../core/auth.js";
import { setFlash, popFlash, noStore, bodyBool } from "../core/http.js";
import { str } from "../core/util.js";
import { adminLayout } from "../views/layout.js";
import {
  listPages, getPage, savePage, deletePage, addSection, saveSection, moveSection, removeSection,
  listNav, saveNavItem, deleteNavItem, listFaqs, saveFaq, deleteFaq, listTestimonials, saveTestimonial, deleteTestimonial
} from "../modules/content.js";
import { sectionFromForm } from "../content/sections.js";
import { renderPageList, renderPageEditor, renderSectionEditor, renderNav, renderFaqs, renderTestimonials } from "../views/admin/content.js";

export const contentAdmin = express.Router();
contentAdmin.use(noStore, requireAuth);
contentAdmin.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh the page and try again.");
  next();
});

const view = (req, res, { title, body, active = "", wide = false, subtitle = "", actions = "", status = 200 }) => {
  res.status(status).send(adminLayout({
    title, body, active, wide, subtitle, actions,
    user: req.user, flash: popFlash(req, res), csrf: res.locals.csrf, nonce: res.locals.nonce
  }));
};

/* ---------------------------------- pages ---------------------------------- */

contentAdmin.get("/pages", requirePermission("content.manage"), (req, res) => {
  view(req, res, { title: "Pages", active: "/admin/pages", body: renderPageList({ pages: listPages(), csrf: res.locals.csrf }) });
});

contentAdmin.get("/pages/new", requirePermission("content.manage"), (req, res) => {
  view(req, res, { title: "New page", active: "/admin/pages", body: renderPageEditor({ csrf: res.locals.csrf }) });
});

contentAdmin.post("/pages", requirePermission("content.manage"), (req, res) => {
  try {
    const page = savePage(req.body);
    setFlash(res, "success", "Page created. Add sections below.");
    res.redirect(`/admin/pages/${page.id}`);
  } catch (err) {
    view(req, res.status(400), { title: "New page", active: "/admin/pages", body: renderPageEditor({ csrf: res.locals.csrf, error: err.message }) });
  }
});

contentAdmin.get("/pages/:id", requirePermission("content.manage"), (req, res, next) => {
  const page = getPage(req.params.id);
  if (!page) return next();
  view(req, res, { title: page.title, active: "/admin/pages", subtitle: page.is_home ? "Homepage" : `/p/${page.slug}`, body: renderPageEditor({ page, csrf: res.locals.csrf }) });
});

contentAdmin.post("/pages/:id", requirePermission("content.manage"), (req, res, next) => {
  const page = getPage(req.params.id);
  if (!page) return next();
  try {
    const saved = savePage({ ...req.body, id: page.id });
    setFlash(res, "success", "Page saved.");
    res.redirect(`/admin/pages/${saved.id}`);
  } catch (err) {
    view(req, res.status(400), { title: page.title, active: "/admin/pages", body: renderPageEditor({ page, csrf: res.locals.csrf, error: err.message }) });
  }
});

contentAdmin.post("/pages/:id/delete", requirePermission("content.manage"), (req, res, next) => {
  try {
    deletePage(req.params.id);
    setFlash(res, "success", "Page deleted.");
    res.redirect("/admin/pages");
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect(`/admin/pages/${req.params.id}`);
  }
});

/* --------------------------------- sections -------------------------------- */

contentAdmin.post("/pages/:id/sections", requirePermission("content.manage"), (req, res) => {
  try {
    const page = addSection(req.params.id, String(req.body?.type || ""));
    const created = page[page.length - 1];
    setFlash(res, "success", "Section added. Edit it to add content.");
    res.redirect(`/admin/pages/${req.params.id}/sections/${created.id}`);
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect(`/admin/pages/${req.params.id}`);
  }
});

contentAdmin.get("/pages/:id/sections/:sid", requirePermission("content.manage"), (req, res, next) => {
  const page = getPage(req.params.id);
  const section = page?.sections.find((s) => s.id === req.params.sid);
  if (!page || !section) return next();
  view(req, res, {
    title: `Edit ${section.type.replace(/_/g, " ")}`, active: "/admin/pages",
    subtitle: page.title, body: renderSectionEditor({ page, section, csrf: res.locals.csrf })
  });
});

contentAdmin.post("/pages/:id/sections/:sid", requirePermission("content.manage"), (req, res, next) => {
  const page = getPage(req.params.id);
  const section = page?.sections.find((s) => s.id === req.params.sid);
  if (!page || !section) return next();
  try {
    saveSection(page.id, section.id, sectionFromForm(section.type, req.body));
    setFlash(res, "success", "Section saved. Changes are live.");
    res.redirect(`/admin/pages/${page.id}`);
  } catch (err) {
    view(req, res.status(400), {
      title: `Edit ${section.type}`, active: "/admin/pages",
      body: renderSectionEditor({ page, section: { ...section, ...req.body }, csrf: res.locals.csrf, error: err.message })
    });
  }
});

contentAdmin.post("/pages/:id/sections/:sid/move", requirePermission("content.manage"), (req, res) => {
  moveSection(req.params.id, req.params.sid, String(req.body?.direction || "down"));
  res.redirect(`/admin/pages/${req.params.id}`);
});

contentAdmin.post("/pages/:id/sections/:sid/delete", requirePermission("content.manage"), (req, res) => {
  removeSection(req.params.id, req.params.sid);
  setFlash(res, "success", "Section removed.");
  res.redirect(`/admin/pages/${req.params.id}`);
});

/* -------------------------------- navigation ------------------------------- */

contentAdmin.get("/navigation", requirePermission("content.manage"), (req, res) => {
  view(req, res, { title: "Navigation", active: "/admin/navigation", body: renderNav({ items: listNav(), csrf: res.locals.csrf }) });
});

contentAdmin.post("/navigation", requirePermission("content.manage"), (req, res) => {
  try { saveNavItem(req.body); setFlash(res, "success", "Link added."); }
  catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/navigation");
});

contentAdmin.post("/navigation/:id", requirePermission("content.manage"), (req, res) => {
  try {
    saveNavItem({ ...req.body, id: req.params.id, visible: bodyBool(req.body, "visible") });
    setFlash(res, "success", "Link saved.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/navigation");
});

contentAdmin.post("/navigation/:id/delete", requirePermission("content.manage"), (req, res) => {
  deleteNavItem(req.params.id);
  setFlash(res, "success", "Link removed.");
  res.redirect("/admin/navigation");
});

/* ----------------------------------- faqs ---------------------------------- */

contentAdmin.get("/faqs", requirePermission("content.manage"), (req, res) => {
  view(req, res, { title: "FAQs", active: "/admin/faqs", subtitle: "Used by FAQ sections on any page.", body: renderFaqs({ faqs: listFaqs(), csrf: res.locals.csrf }) });
});

contentAdmin.post("/faqs", requirePermission("content.manage"), (req, res) => {
  try { saveFaq(req.body); setFlash(res, "success", "Question added."); }
  catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/faqs");
});

contentAdmin.post("/faqs/:id", requirePermission("content.manage"), (req, res) => {
  try {
    saveFaq({ ...req.body, id: req.params.id, active: bodyBool(req.body, "active") });
    setFlash(res, "success", "Question saved.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/faqs");
});

contentAdmin.post("/faqs/:id/delete", requirePermission("content.manage"), (req, res) => {
  deleteFaq(req.params.id);
  setFlash(res, "success", "Question deleted.");
  res.redirect("/admin/faqs");
});

/* ------------------------------- testimonials ------------------------------ */

contentAdmin.get("/testimonials", requirePermission("content.manage"), (req, res) => {
  view(req, res, { title: "Testimonials", active: "/admin/testimonials", body: renderTestimonials({ items: listTestimonials(), csrf: res.locals.csrf }) });
});

contentAdmin.post("/testimonials", requirePermission("content.manage"), (req, res) => {
  try { saveTestimonial(req.body); setFlash(res, "success", "Testimonial added."); }
  catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/testimonials");
});

contentAdmin.post("/testimonials/:id", requirePermission("content.manage"), (req, res) => {
  try {
    saveTestimonial({ ...req.body, id: req.params.id, active: bodyBool(req.body, "active") });
    setFlash(res, "success", "Testimonial saved.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/testimonials");
});

contentAdmin.post("/testimonials/:id/delete", requirePermission("content.manage"), (req, res) => {
  deleteTestimonial(req.params.id);
  setFlash(res, "success", "Testimonial deleted.");
  res.redirect("/admin/testimonials");
});
