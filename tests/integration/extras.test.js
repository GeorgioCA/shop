import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { setupInstance, startServer, Client, firstMatch } from "../helpers.js";

test("media, reviews, newsletter and demo card payments", async (t) => {
  const { server, client } = await setupInstance({
    preset: "restaurant",
    env: { PAYMENTS_DEMO: "1" }
  });
  t.after(async () => { await server.stop(); });

  await t.test("an image can be uploaded and used as the logo", async () => {
    const png = await sharp({ create: { width: 120, height: 60, channels: 4, background: "#1f5c4a" } }).png().toBuffer();
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), "logo.png");
    fd.append("_csrf", client.csrf());
    const res = await fetch(`${server.base}/admin/media`, {
      method: "POST",
      headers: { Cookie: client.cookieHeader() },
      body: fd,
      redirect: "manual"
    });
    assert.equal(res.status, 302);

    const library = await client.text("/admin/media");
    const filename = firstMatch(library.html, /value="(m_[^"]+\.webp)"/);
    assert.ok(filename, "the upload is in the library");
    assert.match(library.html, /m_[^"]+\.webp/);

    const themed = await client.post("/admin/theme", {
      preset: "warm", primary: "#7c3f21", primary_hex: "#7c3f21",
      primaryText: "#ffffff", primaryText_hex: "#ffffff",
      accent: "#c2410c", accent_hex: "#c2410c",
      background: "#fdf8f3", background_hex: "#fdf8f3",
      surface: "#ffffff", surface_hex: "#ffffff",
      text: "#2b1c14", text_hex: "#2b1c14",
      muted: "#7a6357", muted_hex: "#7a6357",
      border: "#ecdfd2", border_hex: "#ecdfd2",
      headingFont: "serif", bodyFont: "sans", radius: "soft",
      logo: filename
    });
    assert.equal(themed.status, 302);
    const home = await client.text("/");
    assert.match(home.html, new RegExp(`/media/${filename.replace(".", "\\.")}`));

    const media = await fetch(`${server.base}/media/${filename}`);
    assert.equal(media.status, 200);
    assert.match(media.headers.get("content-type") || "", /image\/webp/);
  });

  await t.test("a review is moderated before it appears", async () => {
    const shop = await client.text("/shop");
    const slug = firstMatch(shop.html, /href="\/product\/([^"]+)"/);
    const review = await client.post(`/product/${slug}/review`, {
      customer_name: "Rita Reviewer", rating: "5", title: "Excellent", body: "The sourdough was outstanding.", email: "rita@example.test"
    });
    assert.equal(review.status, 302);

    const before = await client.text(`/product/${slug}`);
    assert.doesNotMatch(before.html, /outstanding/);

    const queue = await client.text("/admin/reviews");
    assert.match(queue.html, /Rita Reviewer/);
    const id = firstMatch(queue.html, /\/admin\/reviews\/(rv_[^/]+)\/status/);
    await client.post(`/admin/reviews/${id}/status`, { status: "approved" });

    const after = await client.text(`/product/${slug}`);
    assert.match(after.html, /outstanding/);
    assert.match(after.html, /5 out of 5|★★★★★/);
  });

  await t.test("the newsletter form stores a subscriber", async () => {
    const res = await client.post("/newsletter", { email: "news@example.test" });
    assert.equal(res.status, 302);
    const list = await client.text("/admin/newsletter");
    assert.match(list.html, /news@example\.test/);
  });

  await t.test("demo mode completes a card payment without Stripe keys", async () => {
    const enabled = await client.post("/admin/modules/payments/toggle", { enabled: "1" });
    assert.equal(enabled.status, 302);
    const configured = await client.post("/admin/settings/commerce", {
      pickupEnabled: "1", deliveryEnabled: "1", deliveryFeeCents: "5.00", deliveryFreeOverCents: "50.00",
      deliveryArea: "Calgary", onlinePayments: "1", offlinePayments: "1", offlineLabel: "Pay in person",
      offlineInstructions: "Pay when you arrive.", orderPrefix: "TEST-", allowOrderNotes: "1", requirePhone: "0",
      minOrderCents: "0", tipsEnabled: "0", tipPresets: "5,10,15", taxRatePct: "5", taxLabel: "GST", taxDelivery: "0"
    });
    assert.equal(configured.status, 302);

    const shop = await client.text("/shop");
    const productId = firstMatch(shop.html, /data-add-to-cart[^>]*data-id="([^"]+)"/s);
    const res = await client.json("/api/checkout", {
      items: [{ id: productId, qty: 1 }], name: "Card Customer", email: "card@example.test",
      fulfilment: "pickup", payment_method: "stripe"
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.match(res.data.url, /paid=1/);
    const page = await client.text(res.data.url);
    assert.match(page.html, /Paid in full/);
    assert.match(page.html, /Payment received/);
  });
});

test("customer accounts are created after a first order", async (t) => {
  const { server, client } = await setupInstance({ preset: "retail-general" });
  t.after(async () => { await server.stop(); });

  const shop = await client.text("/shop");
  const productId = firstMatch(shop.html, /data-add-to-cart[^>]*data-id="([^"]+)"/s);
  const checkout = await client.json("/api/checkout", {
    items: [{ id: productId, qty: 1 }], name: "Loyal Buyer", email: "loyal@example.test",
    phone: "4035550111", fulfilment: "pickup", payment_method: "offline"
  });
  assert.equal(checkout.status, 200);

  const login = await client.text("/account");
  assert.match(login.html, /Create an account/);

  const created = await client.post("/account/register", {
    name: "Loyal Buyer", email: "loyal@example.test", password: "loyal-password-123"
  });
  assert.equal(created.status, 302);
  const account = await client.text("/account");
  assert.equal(account.status, 200);
  assert.match(account.html, /Hello, Loyal/);
  assert.match(account.html, /ORD-|GS-/);
});
