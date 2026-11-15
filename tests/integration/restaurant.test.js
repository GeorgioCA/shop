import test from "node:test";
import assert from "node:assert/strict";
import { setupInstance, login, firstMatch } from "../helpers.js";

test("restaurant deployment: configure, sell, edit, gate", async (t) => {
  const { server, client } = await setupInstance({ preset: "restaurant" });
  t.after(async () => { await server.stop(); });

  await t.test("preset produced a branded site and a menu", async () => {
    const home = await client.text("/");
    assert.equal(home.status, 200);
    assert.match(home.html, /Juniper Kitchen/);
    assert.match(home.html, /A short menu, cooked over fire/);
    assert.match(home.html, /Wood-fired chicken/);
    assert.match(home.html, /--c-primary:#7c3f21/i);

    const shop = await client.text("/shop");
    assert.equal(shop.status, 200);
    assert.match(shop.html, /<title>Menu · Juniper Kitchen/);
    assert.ok((shop.html.match(/product-card/g) || []).length >= 8);
  });

  const shop = await client.text("/shop");
  const productId = firstMatch(shop.html, /data-add-to-cart[^>]*data-id="([^"]+)"/s);
  assert.ok(productId, "a product id is rendered for the cart");

  await t.test("quote and offline checkout create an order", async () => {
    const quote = await client.json("/api/quote", { items: [{ id: productId, qty: 2 }], fulfilment: "pickup" });
    assert.equal(quote.status, 200);
    assert.equal(quote.data.subtotal_cents, 1600);
    assert.equal(quote.data.total_cents, 1600);

    const checkout = await client.json("/api/checkout", {
      items: [{ id: productId, qty: 2 }],
      name: "Ada Customer",
      email: "ada@example.test",
      phone: "4035550101",
      fulfilment: "pickup",
      payment_method: "offline",
      notes: "Extra napkins"
    });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
    assert.match(checkout.data.url, /^\/order\/ot_/);

    const orderPage = await client.text(checkout.data.url);
    assert.equal(orderPage.status, 200);
    assert.match(orderPage.html, /Ada Customer|ada@example\.test|your order is/i);
    assert.match(orderPage.html, /Wood-fired sourdough/);

    const adminOrders = await client.text("/admin/orders");
    assert.match(adminOrders.html, /JK-\d{6}-[A-Z0-9]{4}/);
    assert.match(adminOrders.html, /Ada Customer/);
  });

  await t.test("checkout rejects an invalid cart and a missing CSRF token", async () => {
    const bad = await client.json("/api/checkout", {
      items: [{ id: "does-not-exist", qty: 1 }],
      name: "No One", email: "no@example.test", fulfilment: "pickup", payment_method: "offline"
    });
    assert.equal(bad.status, 400);

    const { Client } = await import("../helpers.js");
    const raw = new Client(server.base);
    await raw.get("/shop");
    raw.cookies.delete("shop_csrf");
    const res = await raw.request("/api/checkout", {
      method: "POST",
      json: { items: [{ id: productId, qty: 1 }], name: "X", email: "x@example.test", fulfilment: "pickup", payment_method: "offline" },
      headers: { Accept: "application/json" }
    });
    assert.equal(res.status, 403);
  });

  await t.test("admin can create, price, edit and delete a product without code", async () => {
    const created = await client.post("/admin/products", {
      name: "Test Special",
      price: "18.25",
      short_desc: "A limited plate",
      active: "1",
      max_per_order: "4",
      description: "Only for the test."
    });
    assert.equal(created.status, 302);
    const productUrl = created.headers.get("location");
    assert.match(productUrl, /^\/admin\/products\/p_/);

    const shopAfter = await client.text("/shop");
    assert.match(shopAfter.html, /Test Special/);
    assert.match(shopAfter.html, /\$18\.25/);

    const id = productUrl.split("/").pop();
    const edited = await client.post(`/admin/products/${id}`, {
      name: "Test Special", price: "21.00", sale_price: "19.50", short_desc: "Now on sale", active: "1", max_per_order: "4"
    });
    assert.equal(edited.status, 302);
    const detail = await client.text(`/product/test-special`);
    assert.equal(detail.status, 200);
    assert.match(detail.html, /\$19\.50/);

    await client.post(`/admin/products/${id}/delete`);
    const gone = await client.get("/product/test-special");
    assert.equal(gone.status, 404);
  });

  await t.test("a homepage section is editable and the change is live", async () => {
    const pages = await client.text("/admin/pages");
    const pageId = firstMatch(pages.html, /href="\/admin\/pages\/(pg_[^"]+)"/);
    assert.ok(pageId);
    const editor = await client.text(`/admin/pages/${pageId}`);
    const sectionId = firstMatch(editor.html, new RegExp(`/admin/pages/${pageId}/sections/([^"/]+)`));
    assert.ok(sectionId);

    const saved = await client.post(`/admin/pages/${pageId}/sections/${sectionId}`, {
      type: "hero",
      title: "Tonight's test menu",
      eyebrow: "Changed in the admin",
      text: "No code was edited.",
      ctaLabel: "See the menu",
      ctaUrl: "/shop",
      align: "left",
      tall: "1"
    });
    assert.equal(saved.status, 302, await saved.text());
    const home = await client.text("/");
    assert.match(home.html, /Tonight&#39;s test menu|Tonight's test menu/);
  });

  await t.test("theme changes publish to the stylesheet tokens", async () => {
    const before = await client.text("/");
    assert.match(before.html, /--c-primary:#7c3f21/i);
    const res = await client.post("/admin/theme", {
      preset: "minimal", primary: "#123456", primary_hex: "#123456",
      primaryText: "#ffffff", primaryText_hex: "#ffffff",
      accent: "#abcdef", accent_hex: "#abcdef",
      background: "#fafafa", background_hex: "#fafafa",
      surface: "#ffffff", surface_hex: "#ffffff",
      text: "#111111", text_hex: "#111111",
      muted: "#666666", muted_hex: "#666666",
      border: "#dddddd", border_hex: "#dddddd",
      headingFont: "sans", bodyFont: "sans", radius: "sharp"
    });
    assert.equal(res.status, 302);
    const after = await client.text("/");
    assert.match(after.html, /--c-primary:#123456/);
    assert.match(after.html, /--font-head:-apple-system/);
  });

  await t.test("disabling commerce hides checkout and keeps order data", async () => {
    const off = await client.post("/admin/modules/commerce/toggle", { enabled: "0", cascade: "1" });
    assert.equal(off.status, 302);

    assert.equal((await client.get("/checkout")).status, 404);
    const home = await client.text("/");
    assert.doesNotMatch(home.html, /data-cart-open/);
    const orders = await client.text("/admin/orders");
    assert.match(orders.html, /Ada Customer/);

    await client.post("/admin/modules/commerce/toggle", { enabled: "1" });
    assert.equal((await client.get("/checkout")).status, 200);
  });

  await t.test("admin writes require a CSRF token", async () => {
    const { Client } = await import("../helpers.js");
    const other = new Client(server.base);
    await other.get("/admin/login");
    await other.post("/admin/login", { email: "owner@example.test", password: "test-password-123" });
    await other.get("/admin");
    other.cookies.delete("shop_csrf");
    const res = await other.post("/admin/products", { name: "No Token", price: "1.00" });
    assert.equal(res.status, 403);
  });

  await t.test("staff cannot reach user management; owner can", async () => {
    const created = await client.post("/admin/users", {
      name: "Sam Staff", email: "sam@example.test", role: "staff", password: "staff-password-123"
    });
    assert.equal(created.status, 302);
    const { client: staff } = await login(server.base, "sam@example.test", "staff-password-123");
    assert.equal((await staff.get("/admin/users")).status, 403);
    assert.equal((await staff.get("/admin")).status, 200);
    assert.equal((await client.get("/admin/users")).status, 200);
  });
});
