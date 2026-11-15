// Admin: product catalog.

import { config } from "../../core/config.js";
import { isEnabled } from "../../core/modules.js";
import { esc, money, centsInput, truncate } from "../../core/util.js";
import { icon, field, button, emptyState, pagination, statusBadge } from "../components.js";
import { mediaUrl } from "../../core/media.js";
import { csrfField } from "../layout.js";
import { pairsToText } from "../../modules/catalog.js";

const moneyFmt = (c) => money(c, config().business.currency, config().business.locale);

export function renderProductList({ products, categories, query = "", csrf, total = 0, pager = null, flash = null }) {
  const byId = new Map(categories.map((c) => [c.id, c.name]));
  return `${flash || ""}
  <div class="toolbar">
    <form method="get" action="/admin/products" class="toolbar-search">
      <label class="search">${icon("help", { size: 16 })}<input class="input input-sm" type="search" name="q" value="${esc(query)}" placeholder="Search products"></label>
      <button class="btn btn-secondary btn-sm" type="submit">Search</button>
    </form>
    <div class="toolbar-actions">
      <a class="btn btn-ghost btn-sm" href="/admin/products.csv">${icon("download", { size: 16 })} Export CSV</a>
      ${button({ label: "New product", href: "/admin/products/new", variant: "primary", size: "sm", icon: "plus" })}
    </div>
  </div>
  ${products.length ? `<div class="table-wrap card"><table class="table table-hover">
    <thead><tr><th></th><th>Product</th><th>Category</th><th class="ta-right">Price</th><th class="ta-right">Stock</th><th>Status</th><th></th></tr></thead>
    <tbody>${products.map((p) => `<tr>
      <td class="cell-thumb">${p.image ? `<img src="${esc(mediaUrl(p.image))}" alt="">` : `<span class="thumb-ph">${icon("box", { size: 16 })}</span>`}</td>
      <td><a class="strong" href="/admin/products/${esc(p.id)}">${esc(p.name)}</a><br><small class="muted">${esc(p.sku || "No SKU")}</small></td>
      <td>${esc(byId.get(p.category_id) || "—")}</td>
      <td class="ta-right">${esc(moneyFmt(p.price_now))}${p.on_sale ? `<br><small class="text-warn">Sale</small>` : ""}</td>
      <td class="ta-right">${p.sold_out ? statusBadge("sold_out") : p.track_stock ? `<span class="${p.stock <= config().catalog.lowStockThreshold ? "text-warn" : ""}">${p.stock}</span>` : `<span class="muted">—</span>`}</td>
      <td>${p.active ? statusBadge("active") : statusBadge("draft")}${p.featured ? ` ${statusBadge("featured")}` : ""}</td>
      <td class="ta-right"><a class="btn btn-ghost btn-sm" href="/admin/products/${esc(p.id)}">Edit</a></td>
    </tr>`).join("")}</tbody></table></div>
    ${pager ? pagination(pager, "/admin/products", { q: query }) : ""}`
    : emptyState("No products yet", "Add your first product, or apply an industry preset to seed a sample catalog.", button({ label: "New product", href: "/admin/products/new", variant: "primary" }))}`;
}

export function renderProductForm({ product = null, categories, csrf, error = "" }) {
  const p = product || {};
  const catOptions = [{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];
  return `${error ? `<div class="flash flash-error" role="alert">${icon("help", { size: 18 })}<span>${esc(error)}</span></div>` : ""}
  <form method="post" action="${product ? `/admin/products/${esc(product.id)}` : "/admin/products"}" class="settings-form">
    ${csrfField(csrf)}
    ${product ? `<input type="hidden" name="id" value="${esc(product.id)}">` : ""}
    <div class="editor-layout">
      <div>
        <section class="card"><div class="card-pad">
          <h2>Basics</h2>
          <div class="form-grid">
            ${field({ name: "name", label: "Name", required: true, value: p.name || "", autocomplete: "off" })}
            ${field({ name: "category_id", label: "Category", type: "select", value: p.category_id || "", options: catOptions })}
            ${field({ name: "sku", label: "SKU", value: p.sku || "", help: "Leave blank to generate one." })}
            ${field({ name: "slug", label: "URL slug", value: p.slug || "", help: "Leave blank to derive it from the name." })}
          </div>
          ${field({ name: "short_desc", label: "Short description", value: p.short_desc || "", help: "One line, used on cards and search results." })}
          ${field({ name: "description", label: "Description", type: "textarea", value: p.description || "", rows: 8, help: "Blank lines separate paragraphs." })}
        </div></section>
        <section class="card"><div class="card-pad">
          <h2>Price</h2>
          <div class="form-grid">
            ${field({ name: "price", label: "Regular price", type: "money", value: centsInput(p.price_cents ?? 0), required: true })}
            ${field({ name: "sale_price", label: "Sale price", type: "money", value: centsInput(p.sale_price_cents), help: "Leave empty for no sale." })}
            ${field({ name: "cost", label: "Unit cost", type: "money", value: centsInput(p.cost_cents ?? 0), help: "Used for margin reporting. Not shown to customers." })}
            ${field({ name: "taxable", label: "Taxable", type: "checkbox", value: p.taxable !== 0 })}
          </div>
        </div></section>
        <section class="card"><div class="card-pad">
          <h2>Variants & attributes</h2>
          <p class="muted">Products in the same variant group share one storefront card. Attributes are free-form specs — allergens, dimensions, engine size, anything.</p>
          <div class="form-grid">
            ${field({ name: "variant_group", label: "Variant group", value: p.variant_group || "", placeholder: "e.g. Heavyweight tee" })}
            ${field({ name: "max_per_order", label: "Maximum per order", type: "number", value: p.max_per_order ?? 10, min: 1, max: 999 })}
          </div>
          ${field({ name: "variant_options", label: "Variant options", type: "textarea", value: pairsToText(p.variant_options), rows: 3, help: "One per line: Label | Value. Every member of a group needs identical labels." })}
          ${field({ name: "attributes", label: "Attributes", type: "textarea", value: pairsToText(p.attributes), rows: 4, help: "One per line: Label | Value" })}
        </div></section>
      </div>
      <aside>
        <section class="card"><div class="card-pad">
          <h2>Status</h2>
          ${field({ name: "active", label: "Visible on the site", type: "checkbox", value: p.active !== 0 })}
          ${field({ name: "featured", label: "Featured", type: "checkbox", value: !!p.featured })}
          ${isEnabled("inventory") ? `${field({ name: "track_stock", label: "Track stock", type: "checkbox", value: !!p.track_stock, help: "When on, stock gates sales." })}
            ${field({ name: "stock", label: "Stock on hand", type: "number", value: p.stock ?? 0, min: 0 })}
            ${field({ name: "sold_out", label: "Sold out", type: "checkbox", value: !!p.sold_out, help: "Overrides stock." })}` : ""}
          ${field({ name: "sort", label: "Sort order", type: "number", value: p.sort ?? 100, min: 0, help: "Lower numbers appear first." })}
        </div></section>
        <section class="card"><div class="card-pad">
          <h2>Image</h2>
          ${field({ name: "image", label: "Main image", value: p.image || "", placeholder: "m_… or https://" })}
          <label class="btn btn-secondary btn-sm btn-block">${icon("image", { size: 16 })} Upload image<input type="file" hidden data-upload-for="image"></label>
          <div class="media-preview-lg" data-preview-for="image">${p.image ? `<img src="${esc(mediaUrl(p.image))}" alt="">` : ""}</div>
          ${field({ name: "gallery", label: "Gallery", type: "textarea", value: (p.gallery || []).join("\n"), rows: 3, help: "One image per line." })}
        </div></section>
      </aside>
    </div>
    <div class="sticky-actions">
      <button class="btn btn-primary" type="submit">${product ? "Save product" : "Create product"}</button>
      <a class="btn btn-ghost" href="/admin/products">Cancel</a>
      ${product ? `<button class="btn btn-danger btn-ghost" type="submit" formaction="/admin/products/${esc(product.id)}/delete" data-confirm="Delete this product? Past orders keep their own copy.">Delete</button>` : ""}
    </div>
  </form>`;
}

export function renderCategories({ productCats, serviceCats, csrf }) {
  const table = (cats, kind) => `<div class="card"><div class="card-head"><h2>${kind === "product" ? "Product" : "Service"} categories</h2></div>
    ${cats.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Slug</th><th class="ta-right">Items</th><th></th></tr></thead><tbody>
      ${cats.map((c) => `<tr>
        <td><form method="post" action="/admin/categories/${esc(c.id)}" class="inline-edit">${csrfField(csrf)}
          <input class="input input-sm" name="name" value="${esc(c.name)}" aria-label="Category name">
          <input class="input input-sm" name="description" value="${esc(c.description)}" placeholder="Description" aria-label="Description">
          <input type="hidden" name="kind" value="${esc(kind)}">
          <button class="btn btn-ghost btn-sm" type="submit">Save</button>
        </form></td>
        <td><code>${esc(c.slug)}</code></td>
        <td class="ta-right">${c.count ?? 0}</td>
        <td class="ta-right"><button class="btn btn-ghost btn-sm text-danger" type="submit" form="del-${esc(c.id)}">Delete</button></td>
      </tr>`).join("")}</tbody></table></div>` : `<p class="muted card-pad">No categories yet.</p>`}
    <div class="card-pad border-top">
      <form method="post" action="/admin/categories" class="inline-form">
        ${csrfField(csrf)}<input type="hidden" name="kind" value="${esc(kind)}">
        <input class="input input-sm" name="name" placeholder="New category name" required>
        <input class="input input-sm" name="description" placeholder="Description (optional)">
        <button class="btn btn-secondary btn-sm" type="submit">Add</button>
      </form>
    </div>
    ${cats.map((c) => `<form id="del-${esc(c.id)}" method="post" action="/admin/categories/${esc(c.id)}/delete" data-confirm="Delete this category?">${csrfField(csrf)}</form>`).join("")}
  </div>`;
  return `${table(productCats, "product")}${table(serviceCats, "service")}`;
}

export function renderProductsCsvHint() {
  return `<p class="muted">Export includes SKU, name, category, price, cost and stock.</p>`;
}
