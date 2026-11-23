// HTTP-level regression tests for the security fixes: capability URLs,
// open redirects, executable link schemes and SVG sanitisation.

import test from "node:test";
import assert from "node:assert/strict";
import { setupInstance, Client, firstMatch } from "../helpers.js";

test("order pages are reachable by token only", async (t) => {
  const { server, client } = await setupInstance({ preset: "restaurant" });
  t.after(async () => { await server.stop(); });

  const shop = await client.text("/shop");
  const productId = firstMatch(shop.html, /data-add-to-cart[^>]*data-id="([^"]+)"/s);
  const checkout = await client.json("/api/checkout", {
    items: [{ id: productId, qty: 1 }], name: "Token Buyer", email: "token@example.test",
    fulfilment: "pickup", payment_method: "offline"
  });
  assert.equal(checkout.status, 200);
  const token = checkout.data.url.split("/").pop();
  assert.match(token, /^ot_/);

  const byToken = await client.text(`/order/${token}`);
  assert.equal(byToken.status, 200);

  // The short, date-stamped order number must never work as a public URL.
  const number = firstMatch(byToken.html, /([A-Z0-9]{1,8}-[0-9]{6}-[A-F0-9]{4})/);
  assert.ok(number, "the page shows the order number");
  assert.notEqual(number, token);
  const byNumber = await client.get(`/order/${number}`);
  assert.equal(byNumber.status, 404);
});

test("booking pages are reachable by token only", async (t) => {
  const { server, client } = await setupInstance({ preset: "consulting" });
  t.after(async () => { await server.stop(); });

  const services = await client.text("/services");
  const serviceId = firstMatch(services.html, /href="\/book\?service=([^"]+)"/);
  assert.ok(serviceId, "a bookable service exists");

  const date = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const day = await client.text(`/book?service=${serviceId}&date=${date}`);
  const slot = firstMatch(day.html, /name="starts_at" value="([^"]+)"/);
  assert.ok(slot, "a slot is offered three days out");

  const booked = await client.post("/book", {
    service_id: serviceId, name: "Book Buyer", email: "booked@example.test",
    phone: "4035550111", starts_at: slot, date
  });
  assert.equal(booked.status, 302);
  const token = booked.headers.get("location").split("/").pop();
  assert.match(token, /^bt_/);

  const page = await client.text(`/booking/${token}`);
  assert.equal(page.status, 200);
  const number = firstMatch(page.html, /([A-Z0-9]{1,8}-[0-9]{6}-[A-F0-9]{4})/);
  assert.ok(number);
  assert.notEqual(number, token);
  const byNumber = await client.get(`/booking/${number}`);
  assert.equal(byNumber.status, 404);
});

test("login next cannot redirect off-site, even with a backslash", async (t) => {
  const { server } = await setupInstance({ preset: "restaurant" });
  t.after(async () => { await server.stop(); });

  const c = new Client(server.base);
  await c.get("/admin/login");
  const bad = await c.post("/admin/login", { email: "owner@example.test", password: "test-password-123", next: "/\\evil.com" });
  assert.equal(bad.headers.get("location"), "/admin");

  const c2 = new Client(server.base);
  await c2.get("/admin/login");
  const protocol = await c2.post("/admin/login", { email: "owner@example.test", password: "test-password-123", next: "//evil.com" });
  assert.equal(protocol.headers.get("location"), "/admin");

  const c3 = new Client(server.base);
  await c3.get("/admin/login");
  const good = await c3.post("/admin/login", { email: "owner@example.test", password: "test-password-123", next: "/admin/orders" });
  assert.equal(good.headers.get("location"), "/admin/orders");
});

test("nav links and section buttons reject executable URLs", async (t) => {
  const { server, client } = await setupInstance({ preset: "restaurant" });
  t.after(async () => { await server.stop(); });

  const nav = await client.post("/admin/navigation", { label: "Evil", url: "javascript:alert(1)" });
  assert.equal(nav.status, 302);
  const navPage = await client.text("/admin/navigation");
  assert.match(navPage.html, /must start with/);
  assert.doesNotMatch(navPage.html, /javascript:/);

  const proto = await client.post("/admin/navigation", { label: "Proto", url: "//evil.com" });
  assert.equal(proto.status, 302);
  assert.match((await client.text("/admin/navigation")).html, /must start with/);

  // A valid link still saves.
  const ok = await client.post("/admin/navigation", { label: "Shop", url: "/shop" });
  assert.equal(ok.status, 302);
  assert.match((await client.text("/")).html, /href="\/shop"/);
});

test("SVG uploads cannot carry script or external links", async (t) => {
  const { server, client } = await setupInstance({ preset: "restaurant" });
  t.after(async () => { await server.stop(); });

  const upload = async (svg, name) => {
    const fd = new FormData();
    fd.append("file", new Blob([svg], { type: "image/svg+xml" }), name);
    fd.append("_csrf", client.csrf());
    return fetch(`${server.base}/admin/media`, {
      method: "POST", headers: { Cookie: client.cookieHeader() }, body: fd, redirect: "manual"
    });
  };
  const library = async () => (await client.text("/admin/media")).html;

  // Rejected uploads leave the library untouched (no SVG rows at all).
  await upload('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "script.svg");
  await upload('<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="javascript:alert(1)"/></svg>', "smil.svg");
  await upload('<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil.com/x"><text>x</text></a></svg>', "ext.svg");
  await upload('<svg xmlns="http://www.w3.org/2000/svg"><use href="http://evil.com/x.svg#e"/></svg>', "use.svg");
  assert.doesNotMatch(await library(), /value="m_[^"]+\.svg"/);

  // A fragment-only SVG is fine.
  await upload('<svg xmlns="http://www.w3.org/2000/svg"><a href="#top"><text>ok</text></a></svg>', "ok.svg");
  assert.match(await library(), /value="m_[^"]+\.svg"/);
});
