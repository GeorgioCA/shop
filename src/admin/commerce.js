// Admin: everything a business sells, fulfils and hears about.

import express from "express";
import { db } from "../core/db.js";
import { config } from "../core/config.js";
import { isEnabled } from "../core/modules.js";
import { requireAuth, requirePermission, verifyCsrf } from "../core/auth.js";
import { setFlash, popFlash, noStore, bodyBool, asyncHandler } from "../core/http.js";
import { esc, money, toCsv, localDateStr, nowIso, paginate, int, str, fmtDate, fmtTime, zonedToUtc } from "../core/util.js";
import { adminLayout } from "../views/layout.js";
import { listProducts, getProduct, saveProduct, deleteProduct, listCategories, saveCategory, deleteCategory, toggleProductFlag, productStats, suggestSku } from "../modules/catalog.js";
import { listServices, getService, saveService, deleteService, listStaff, saveStaff, deleteStaff } from "../modules/services.js";
import { listOrders, getOrder, setOrderStatus, markPaid, markRefunded, setOrderNotes, ORDER_STATUSES } from "../modules/orders.js";
import { listBookings, getBooking, setBookingStatus, listClosures, addClosure, deleteClosure } from "../modules/bookings.js";
import { listCustomers, getCustomer, updateCustomer, customerOrders, customerBookings, customerSpend, customerPoints, setCustomerMarketing } from "../modules/customers.js";
import { listInquiries, getInquiry, setInquiryStatus, saveInquiryNotes } from "../modules/inquiries.js";
import { listDiscounts, saveDiscount, toggleDiscount, deleteDiscount, getDiscount } from "../modules/discounts.js";
import { listReviews, setReviewStatus, deleteReview } from "../modules/reviews.js";
import { listSubscribers, deleteSubscriber, subscribersCsv, subscriberStats } from "../modules/newsletter.js";
import { sendOrderConfirmation, sendOrderStatus } from "../core/mail.js";
import { audit } from "../core/db.js";
import { renderProductList, renderProductForm, renderCategories } from "../views/admin/catalog.js";
import { renderServiceList, renderServiceForm, renderStaff } from "../views/admin/services.js";
import { renderOrderList, renderOrderDetail } from "../views/admin/orders.js";
import { renderBookingList } from "../views/admin/bookings.js";
import { renderCustomers, renderCustomer, renderInquiries, renderInquiry, renderDiscounts, renderReviews, renderNewsletter } from "../views/admin/system.js";

export const commerce = express.Router();
commerce.use(noStore, requireAuth);
commerce.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!verifyCsrf(req)) return res.status(403).send("Session expired. Refresh the page and try again.");
  next();
});

const view = (req, res, { title, body, active = "", wide = false, subtitle = "", actions = "", breadcrumbs = [], status = 200 }) => {
  res.status(status).send(adminLayout({
    title, body, active, wide, subtitle, actions, breadcrumbs,
    user: req.user, flash: popFlash(req, res), csrf: res.locals.csrf, nonce: res.locals.nonce
  }));
};

const base = (req) => process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;

/* -------------------------------- products -------------------------------- */

commerce.get("/products", requirePermission("catalog.manage"), (req, res) => {
  const q = str(req.query.q, 80);
  const all = listProducts({ search: q, sort: "manual" });
  const pager = paginate(all.length, req.query.page, 30);
  view(req, res, {
    title: config().catalog.productsLabel,
    active: "/admin/products",
    subtitle: `${productStats().active || 0} visible · ${productStats().total || 0} total`,
    body: renderProductList({
      products: all.slice(pager.offset, pager.offset + pager.perPage),
      categories: listCategories("product"), query: q, csrf: res.locals.csrf, total: all.length, pager
    })
  });
});

commerce.get("/products.csv", requirePermission("catalog.manage"), (_req, res) => {
  const rows = listProducts();
  const cats = new Map(listCategories("product").map((c) => [c.id, c.name]));
  const csv = toCsv(rows, [
    { label: "SKU", value: (p) => p.sku },
    { label: "Name", value: (p) => p.name },
    { label: "Category", value: (p) => cats.get(p.category_id) || "" },
    { label: "Price", value: (p) => (p.price_cents / 100).toFixed(2) },
    { label: "Sale price", value: (p) => (p.on_sale ? (p.sale_price_cents / 100).toFixed(2) : "") },
    { label: "Cost", value: (p) => (p.cost_cents / 100).toFixed(2) },
    { label: "Stock", value: (p) => (p.track_stock ? p.stock : "") },
    { label: "Active", value: (p) => (p.active ? "yes" : "no") },
    { label: "URL", value: (p) => `/product/${p.slug}` }
  ]);
  res.type("text/csv").attachment("products.csv").send(csv);
});

commerce.get("/products/new", requirePermission("catalog.manage"), (req, res) => {
  view(req, res, { title: "New product", active: "/admin/products", body: renderProductForm({ categories: listCategories("product"), csrf: res.locals.csrf }) });
});

commerce.post("/products", requirePermission("catalog.manage"), (req, res) => {
  try {
    const product = saveProduct(req.body);
    audit(req.user, "product.create", "product", product.id, product.name, req.ip);
    setFlash(res, "success", "Product created.");
    res.redirect(`/admin/products/${product.id}`);
  } catch (err) {
    view(req, res.status(400), {
      title: "New product", active: "/admin/products",
      body: renderProductForm({ product: { ...req.body, price_cents: 0 }, categories: listCategories("product"), csrf: res.locals.csrf, error: err.message })
    });
  }
});

commerce.get("/products/:id", requirePermission("catalog.manage"), (req, res, next) => {
  const product = getProduct(req.params.id);
  if (!product) return next();
  view(req, res, {
    title: product.name, active: "/admin/products", subtitle: product.sku,
    actions: `<a class="btn btn-ghost btn-sm" href="/product/${esc(product.slug)}" target="_blank">${esc("View on site ↗")}</a>`,
    body: renderProductForm({ product, categories: listCategories("product"), csrf: res.locals.csrf })
  });
});

commerce.post("/products/:id", requirePermission("catalog.manage"), (req, res, next) => {
  const existing = getProduct(req.params.id);
  if (!existing) return next();
  try {
    const product = saveProduct({ ...req.body, id: existing.id });
    audit(req.user, "product.update", "product", product.id, product.name, req.ip);
    setFlash(res, "success", "Product saved.");
    res.redirect(`/admin/products/${product.id}`);
  } catch (err) {
    view(req, res.status(400), {
      title: existing.name, active: "/admin/products",
      body: renderProductForm({ product: { ...existing, ...req.body, price_cents: existing.price_cents, sale_price_cents: existing.sale_price_cents }, categories: listCategories("product"), csrf: res.locals.csrf, error: err.message })
    });
  }
});

commerce.post("/products/:id/delete", requirePermission("catalog.manage"), (req, res, next) => {
  try {
    const product = getProduct(req.params.id);
    if (!product) return next();
    deleteProduct(product.id);
    audit(req.user, "product.delete", "product", product.id, product.name, req.ip);
    setFlash(res, "success", "Product deleted. Past orders keep their own copy.");
    res.redirect("/admin/products");
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect(`/admin/products/${req.params.id}`);
  }
});

/* -------------------------------- categories ------------------------------- */

commerce.get("/categories", requirePermission("catalog.manage"), (req, res) => {
  const withCounts = (kind) => listCategories(kind).map((c) => ({
    ...c,
    count: kind === "product"
      ? db.prepare("SELECT COUNT(*) AS n FROM products WHERE category_id = ?").get(c.id).n
      : db.prepare("SELECT COUNT(*) AS n FROM services WHERE category_id = ?").get(c.id).n
  }));
  view(req, res, { title: "Categories", active: "/admin/categories", body: renderCategories({ productCats: withCounts("product"), serviceCats: withCounts("service"), csrf: res.locals.csrf }) });
});

commerce.post("/categories", requirePermission("catalog.manage"), (req, res) => {
  try {
    saveCategory({ kind: req.body?.kind, name: req.body?.name, description: req.body?.description });
    setFlash(res, "success", "Category added.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/categories");
});

commerce.post("/categories/:id", requirePermission("catalog.manage"), (req, res) => {
  try {
    saveCategory({ id: req.params.id, kind: req.body?.kind, name: req.body?.name, description: req.body?.description });
    setFlash(res, "success", "Category saved.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/categories");
});

commerce.post("/categories/:id/delete", requirePermission("catalog.manage"), (req, res) => {
  try {
    deleteCategory(req.params.id);
    setFlash(res, "success", "Category deleted.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/categories");
});

/* -------------------------------- services --------------------------------- */

commerce.get("/services", requirePermission("services.manage"), (req, res) => {
  view(req, res, {
    title: config().catalog.servicesLabel, active: "/admin/services",
    body: renderServiceList({ services: listServices(), staff: listStaff(), csrf: res.locals.csrf })
  });
});

commerce.get("/services/new", requirePermission("services.manage"), (req, res) => {
  view(req, res, { title: "New service", active: "/admin/services", body: renderServiceForm({ categories: listCategories("service"), staff: listStaff(), csrf: res.locals.csrf }) });
});

commerce.post("/services", requirePermission("services.manage"), (req, res) => {
  try {
    const service = saveService(req.body);
    audit(req.user, "service.create", "service", service.id, service.name, req.ip);
    setFlash(res, "success", "Service created.");
    res.redirect(`/admin/services/${service.id}`);
  } catch (err) {
    view(req, res.status(400), {
      title: "New service", active: "/admin/services",
      body: renderServiceForm({ service: { ...req.body, price_cents: 0 }, categories: listCategories("service"), staff: listStaff(), csrf: res.locals.csrf, error: err.message })
    });
  }
});

commerce.get("/services/:id", requirePermission("services.manage"), (req, res, next) => {
  const service = getService(req.params.id);
  if (!service) return next();
  view(req, res, { title: service.name, active: "/admin/services", body: renderServiceForm({ service, categories: listCategories("service"), staff: listStaff(), csrf: res.locals.csrf }) });
});

commerce.post("/services/:id", requirePermission("services.manage"), (req, res, next) => {
  const existing = getService(req.params.id);
  if (!existing) return next();
  try {
    const service = saveService({ ...req.body, id: existing.id });
    audit(req.user, "service.update", "service", service.id, service.name, req.ip);
    setFlash(res, "success", "Service saved.");
    res.redirect(`/admin/services/${service.id}`);
  } catch (err) {
    view(req, res.status(400), { title: existing.name, active: "/admin/services", body: renderServiceForm({ service: { ...existing, ...req.body, price_cents: existing.price_cents }, categories: listCategories("service"), staff: listStaff(), csrf: res.locals.csrf, error: err.message }) });
  }
});

commerce.post("/services/:id/delete", requirePermission("services.manage"), (req, res, next) => {
  try {
    const service = getService(req.params.id);
    if (!service) return next();
    deleteService(service.id);
    audit(req.user, "service.delete", "service", service.id, service.name, req.ip);
    setFlash(res, "success", "Service deleted.");
    res.redirect("/admin/services");
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect(`/admin/services/${req.params.id}`);
  }
});

commerce.get("/staff", requirePermission("services.manage"), (req, res) => {
  view(req, res, { title: "Staff", active: "/admin/staff", body: renderStaff({ staff: listStaff(), csrf: res.locals.csrf }) });
});

commerce.post("/staff", requirePermission("services.manage"), (req, res) => {
  try { saveStaff(req.body); setFlash(res, "success", "Staff member added."); }
  catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/staff");
});

commerce.post("/staff/:id/delete", requirePermission("services.manage"), (req, res) => {
  deleteStaff(req.params.id);
  setFlash(res, "success", "Staff member removed.");
  res.redirect("/admin/staff");
});

/* --------------------------------- orders ---------------------------------- */

commerce.get("/orders", requirePermission("orders.view"), (req, res) => {
  const filters = { status: str(req.query.status, 20) || "all", search: str(req.query.q, 80) };
  const { rows, pager } = listOrders({ ...filters, page: req.query.page, perPage: 25 });
  const counts = Object.fromEntries(
    db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all().map((r) => [r.status, r.n])
  );
  view(req, res, { title: "Orders", active: "/admin/orders", body: renderOrderList({ orders: rows, pager, filters, csrf: res.locals.csrf, counts }) });
});

commerce.get("/orders.csv", requirePermission("orders.view"), (req, res) => {
  const { rows } = listOrders({ status: str(req.query.status, 20) || "all", perPage: 5000 });
  const csv = toCsv(rows, [
    { label: "Order", value: (o) => o.number },
    { label: "Date", value: (o) => o.created_at },
    { label: "Name", value: (o) => o.name },
    { label: "Email", value: (o) => o.email },
    { label: "Phone", value: (o) => o.phone },
    { label: "Fulfilment", value: (o) => o.fulfilment },
    { label: "Status", value: (o) => o.status },
    { label: "Payment", value: (o) => o.payment_status },
    { label: "Subtotal", value: (o) => (o.subtotal_cents / 100).toFixed(2) },
    { label: "Tax", value: (o) => (o.tax_cents / 100).toFixed(2) },
    { label: "Delivery", value: (o) => (o.delivery_cents / 100).toFixed(2) },
    { label: "Total", value: (o) => (o.total_cents / 100).toFixed(2) },
    { label: "Currency", value: (o) => o.currency }
  ]);
  res.type("text/csv").attachment("orders.csv").send(csv);
});

commerce.get("/orders/:number", requirePermission("orders.view"), (req, res, next) => {
  const order = getOrder(req.params.number);
  if (!order) return next();
  view(req, res, { title: `Order ${order.number}`, active: "/admin/orders", body: renderOrderDetail({ order, items: order.items, csrf: res.locals.csrf }) });
});

commerce.post("/orders/:number/status", requirePermission("orders.manage"), (req, res) => {
  const order = getOrder(req.params.number);
  if (!order) return res.redirect("/admin/orders");
  try {
    const next = setOrderStatus(order.id, String(req.body?.status || ""));
    audit(req.user, "order.status", "order", order.number, `→ ${next.status}`, req.ip);
    if (["confirmed", "ready", "completed", "cancelled"].includes(next.status)) sendOrderStatus(next, `${base(req)}/order/${next.token}`);
    setFlash(res, "success", `Order marked ${next.status}.`);
    res.redirect(`/admin/orders/${order.number}`);
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect(`/admin/orders/${order.number}`);
  }
});

commerce.post("/orders/:number/paid", requirePermission("orders.manage"), (req, res) => {
  const order = getOrder(req.params.number);
  if (!order) return res.redirect("/admin/orders");
  markPaid(order.id);
  audit(req.user, "order.paid", "order", order.number, "", req.ip);
  setFlash(res, "success", "Order marked paid.");
  res.redirect(`/admin/orders/${order.number}`);
});

commerce.post("/orders/:number/refunded", requirePermission("orders.manage"), (req, res) => {
  const order = getOrder(req.params.number);
  if (!order) return res.redirect("/admin/orders");
  markRefunded(order.id);
  audit(req.user, "order.refunded", "order", order.number, "", req.ip);
  setFlash(res, "success", "Marked refunded. Issue the refund in Stripe separately.");
  res.redirect(`/admin/orders/${order.number}`);
});

commerce.post("/orders/:number/notes", requirePermission("orders.manage"), (req, res) => {
  const order = getOrder(req.params.number);
  if (!order) {
    setFlash(res, "error", "Order not found.");
    return res.redirect("/admin/orders");
  }
  setOrderNotes(order.id, { admin_notes: req.body?.admin_notes });
  setFlash(res, "success", "Notes saved.");
  res.redirect(`/admin/orders/${order.number}`);
});

commerce.post("/orders/:number/email", requirePermission("orders.manage"), asyncHandler(async (req, res) => {
  const order = getOrder(req.params.number);
  if (!order) return res.redirect("/admin/orders");
  const result = await sendOrderConfirmation(order, order.items, `${base(req)}/order/${order.token}`);
  setFlash(res, result.ok ? "success" : "error", result.ok ? "Confirmation sent." : `Email not sent: ${result.error || "not configured"}`);
  res.redirect(`/admin/orders/${order.number}`);
}));

/* -------------------------------- bookings --------------------------------- */

commerce.get("/bookings", requirePermission("bookings.view"), (req, res) => {
  const tz = config().business.timezone;
  const today = localDateStr(new Date(), tz);
  const viewMode = String(req.query.view || "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : today;
  let bookings;
  if (viewMode === "upcoming") {
    bookings = listBookings({ from: nowIso(), limit: 200 });
  } else {
    // Day bounds are computed in the business's zone: a 7pm local booking is
    // stored near midnight UTC the next calendar day and would otherwise
    // vanish from its own day. (starts_at/ends_at are UTC ISO strings.)
    const [y, m, d] = date.split("-").map(Number);
    bookings = listBookings({
      from: zonedToUtc(y, m, d, 0, 0, tz).toISOString(),
      to: zonedToUtc(y, m, d, 23, 59, 59, tz).toISOString(),
      limit: 200
    });
  }
  view(req, res, {
    title: "Bookings", active: "/admin/bookings",
    body: renderBookingList({ bookings, date, csrf: res.locals.csrf, closures: listClosures({ upcomingOnly: true }) })
  });
});

commerce.post("/bookings/:id/status", requirePermission("bookings.manage"), (req, res) => {
  try {
    const booking = getBooking(req.params.id);
    if (!booking) throw new Error("Booking not found.");
    setBookingStatus(booking.id, String(req.body?.status || ""));
    audit(req.user, "booking.status", "booking", booking.number, String(req.body?.status), req.ip);
    setFlash(res, "success", "Booking updated.");
    res.redirect(req.get("referer") || "/admin/bookings");
  } catch (err) {
    setFlash(res, "error", err.message);
    res.redirect("/admin/bookings");
  }
});

commerce.post("/closures", requirePermission("bookings.manage"), (req, res) => {
  try {
    addClosure({ starts_at: req.body?.starts_at, ends_at: req.body?.ends_at, reason: req.body?.reason });
    setFlash(res, "success", "Time blocked.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/bookings#closures");
});

commerce.post("/closures/:id/delete", requirePermission("bookings.manage"), (req, res) => {
  deleteClosure(req.params.id);
  setFlash(res, "success", "Closure removed.");
  res.redirect("/admin/bookings#closures");
});

/* -------------------------------- customers -------------------------------- */

const CUSTOMER_SELECT = `
  SELECT c.*, COUNT(o.id) AS order_count,
    COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cents ELSE 0 END), 0) AS spend_cents
  FROM customers c LEFT JOIN orders o ON o.customer_id = c.id`;

commerce.get("/customers", requirePermission("customers.view"), (req, res) => {
  const q = str(req.query.q, 80);
  const where = q ? "WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?" : "";
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers c ${where}`).get(...params).n;
  const pager = paginate(total, req.query.page, 25);
  const rows = db.prepare(`${CUSTOMER_SELECT} ${where} GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pager.perPage, pager.offset);
  view(req, res, { title: "Customers", active: "/admin/customers", body: renderCustomers({ rows, pager, search: q, csrf: res.locals.csrf }) });
});

commerce.get("/customers.csv", requirePermission("customers.view"), (_req, res) => {
  const rows = db.prepare(`${CUSTOMER_SELECT} GROUP BY c.id ORDER BY c.created_at DESC`).all();
  const csv = toCsv(rows, [
    { label: "Name", value: (c) => c.name },
    { label: "Email", value: (c) => c.email },
    { label: "Phone", value: (c) => c.phone },
    { label: "Orders", value: (c) => c.order_count },
    { label: "Paid spend", value: (c) => (c.spend_cents / 100).toFixed(2) },
    { label: "Marketing", value: (c) => (c.marketing ? "yes" : "no") },
    { label: "Joined", value: (c) => c.created_at }
  ]);
  res.type("text/csv").attachment("customers.csv").send(csv);
});

commerce.get("/customers/:id", requirePermission("customers.view"), (req, res, next) => {
  const customer = getCustomer(req.params.id);
  if (!customer) return next();
  view(req, res, {
    title: customer.name || customer.email, active: "/admin/customers",
    body: renderCustomer({
      customer, orders: customerOrders(customer.id), bookings: customerBookings(customer.id),
      spend: customerSpend(customer.id), points: customerPoints(customer.id), csrf: res.locals.csrf
    })
  });
});

commerce.post("/customers/:id", requirePermission("customers.manage"), (req, res) => {
  try {
    updateCustomer(req.params.id, { name: req.body?.name, phone: req.body?.phone, notes: req.body?.notes, marketing: bodyBool(req.body, "marketing") });
    setFlash(res, "success", "Customer saved.");
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect(`/admin/customers/${req.params.id}`);
});

/* -------------------------------- inquiries -------------------------------- */

commerce.get("/inquiries", requirePermission("inquiries.manage"), (req, res) => {
  const status = str(req.query.status, 20) || "all";
  const { rows, pager } = listInquiries({ status, page: req.query.page });
  view(req, res, { title: "Inquiries", active: "/admin/inquiries", body: renderInquiries({ rows, pager, status, csrf: res.locals.csrf }) });
});

commerce.get("/inquiries/:id", requirePermission("inquiries.manage"), (req, res, next) => {
  const inquiry = getInquiry(req.params.id);
  if (!inquiry) return next();
  view(req, res, { title: inquiry.subject, active: "/admin/inquiries", body: renderInquiry({ inquiry, csrf: res.locals.csrf }) });
});

commerce.post("/inquiries/:id/status", requirePermission("inquiries.manage"), (req, res) => {
  try { setInquiryStatus(req.params.id, String(req.body?.status || "")); setFlash(res, "success", "Inquiry updated."); }
  catch (err) { setFlash(res, "error", err.message); }
  res.redirect(`/admin/inquiries/${req.params.id}`);
});

commerce.post("/inquiries/:id", requirePermission("inquiries.manage"), (req, res) => {
  saveInquiryNotes(req.params.id, req.body?.notes);
  setFlash(res, "success", "Notes saved.");
  res.redirect(`/admin/inquiries/${req.params.id}`);
});

/* -------------------------------- discounts -------------------------------- */

commerce.get("/discounts", requirePermission("discounts.manage"), (req, res) => {
  view(req, res, { title: "Discounts", active: "/admin/discounts", body: renderDiscounts({ discounts: listDiscounts(), csrf: res.locals.csrf }) });
});

commerce.post("/discounts", requirePermission("discounts.manage"), (req, res) => {
  try {
    const d = saveDiscount(req.body);
    audit(req.user, "discount.create", "discount", d.code, "", req.ip);
    setFlash(res, "success", `Code ${d.code} saved.`);
  } catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/discounts");
});

commerce.post("/discounts/:id/toggle", requirePermission("discounts.manage"), (req, res) => {
  const d = db.prepare("SELECT * FROM discounts WHERE id = ?").get(req.params.id);
  if (d) toggleDiscount(d.id, !d.active);
  setFlash(res, "success", "Code updated.");
  res.redirect("/admin/discounts");
});

commerce.post("/discounts/:id/delete", requirePermission("discounts.manage"), (req, res) => {
  deleteDiscount(req.params.id);
  setFlash(res, "success", "Code deleted.");
  res.redirect("/admin/discounts");
});

/* --------------------------------- reviews --------------------------------- */

commerce.get("/reviews", requirePermission("reviews.manage"), (req, res) => {
  view(req, res, { title: "Reviews", active: "/admin/reviews", body: renderReviews({ reviews: listReviews({ limit: 200 }), csrf: res.locals.csrf }) });
});

commerce.post("/reviews/:id/status", requirePermission("reviews.manage"), (req, res) => {
  try { setReviewStatus(req.params.id, String(req.body?.status || "")); setFlash(res, "success", "Review updated."); }
  catch (err) { setFlash(res, "error", err.message); }
  res.redirect("/admin/reviews");
});

commerce.post("/reviews/:id/delete", requirePermission("reviews.manage"), (req, res) => {
  deleteReview(req.params.id);
  setFlash(res, "success", "Review deleted.");
  res.redirect("/admin/reviews");
});

/* -------------------------------- newsletter ------------------------------- */

commerce.get("/newsletter", requirePermission("content.manage"), (req, res) => {
  const { rows, pager } = listSubscribers({ page: req.query.page });
  view(req, res, { title: "Subscribers", active: "/admin/newsletter", body: renderNewsletter({ rows, pager, stats: subscriberStats(), csrf: res.locals.csrf }) });
});

commerce.get("/newsletter.csv", requirePermission("content.manage"), (_req, res) => {
  res.type("text/csv").attachment("subscribers.csv").send(subscribersCsv());
});

commerce.post("/newsletter/:id/delete", requirePermission("content.manage"), (req, res) => {
  deleteSubscriber(req.params.id);
  setFlash(res, "success", "Subscriber removed.");
  res.redirect("/admin/newsletter");
});
