// Helcim card payments against a stub Helcim API. Covers the HelcimPay.js
// confirm path (read-back verification, amount matching, idempotency) and the
// signed webhook.

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { setupInstance, Client, firstMatch } from "../helpers.js";

const VERIFIER_TOKEN = Buffer.from("test-verifier-bytes-for-helcim").toString("base64");

function helcimSignature(rawBody, id, timestamp) {
  const key = Buffer.from(VERIFIER_TOKEN, "base64");
  return crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
}

// Stub Helcim API: one checkout session at a time, remembered by transaction id.
function helcimStub() {
  const state = { session: null, nextId: 4200 };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && req.url === "/helcim-pay/initialize") {
        const input = JSON.parse(body);
        const id = String(state.nextId++);
        state.session = { id, ...input };
        res.end(JSON.stringify({ checkoutToken: `tok_${id}`, secretToken: "stub-secret" }));
        return;
      }
      const tx = req.url.match(/^\/card-transactions\/(\d+)$/);
      if (req.method === "GET" && tx) {
        if (tx[1] === "4999") {
          // Deliberately wrong amount for the mismatch test.
          res.end(JSON.stringify({
            transactionId: 4999, status: "APPROVED", type: "purchase",
            amount: 999, currency: "CAD", invoiceNumber: "OTHER-ORDER"
          }));
          return;
        }
        const session = state.session;
        if (!session || tx[1] !== session.id) {
          res.statusCode = 404;
          res.end(JSON.stringify({ errors: ["Transaction not found"] }));
          return;
        }
        const amount = session.invoiceRequest.amount ?? session.amount;
        res.end(JSON.stringify({
          transactionId: Number(tx[1]),
          status: "APPROVED",
          type: "purchase",
          amount,
          currency: session.currency,
          invoiceNumber: session.invoiceRequest?.invoiceNumber || "",
          customerCode: "CSTSTUB",
          approvalCode: "TSTSTUB"
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ errors: ["Unknown route"] }));
    });
  });
  return { server, state };
}

async function prepareStore({ client }) {
  await client.post("/admin/modules/payments/toggle", { enabled: "1" });
  await client.post("/admin/settings/commerce", {
    pickupEnabled: "1", deliveryEnabled: "0", onlinePayments: "1", offlinePayments: "1",
    offlineLabel: "Pay in person", offlineInstructions: "Pay when you arrive.",
    orderPrefix: "TEST-", requirePhone: "0", minOrderCents: "0",
    tipsEnabled: "0", tipPresets: "5,10,15", taxRatePct: "5", taxLabel: "GST", taxDelivery: "0"
  });
  const shop = await client.text("/shop");
  const productId = firstMatch(shop.html, /data-add-to-cart[^>]*data-id="([^"]+)"/s);
  return productId;
}

test("Helcim checkout: session, verified confirmation and idempotency", async (t) => {
  const stub = helcimStub();
  await new Promise((r) => stub.server.listen(0, "127.0.0.1", r));
  t.after(async () => { stub.server.close(); });

  const { server, client } = await setupInstance({
    preset: "restaurant",
    env: { HELCIM_API_TOKEN: "test-token", HELCIM_API_URL: `http://127.0.0.1:${stub.server.address().port}` }
  });
  t.after(async () => { await server.stop(); });

  const productId = await prepareStore({ client });
  const checkout = await client.json("/api/checkout", {
    items: [{ id: productId, qty: 1 }], name: "Helcim Buyer", email: "helcim@example.test",
    fulfilment: "pickup", payment_method: "helcim"
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
  assert.ok(checkout.data.helcim?.checkoutToken, "a checkout token is returned");
  assert.ok(checkout.data.orderToken, "the order token is returned for confirmation");

  // Unpaid until the transaction is verified.
  const pending = await client.text(`/order/${checkout.data.orderToken}`);
  assert.match(pending.html, /Card payment pending/);

  // The browser relays the SUCCESS message; the server reads the transaction
  // back from Helcim and only then marks the order paid.
  const transactionId = checkout.data.helcim.checkoutToken.replace("tok_", "");
  const confirm = await client.json("/api/helcim/confirm", {
    orderToken: checkout.data.orderToken,
    response: JSON.stringify({ data: { transactionId, status: "APPROVED" }, hash: "ignored" })
  });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
  assert.match(confirm.data.url, /paid=1/);

  const paid = await client.text(confirm.data.url);
  assert.match(paid.html, /Paid in full/);
  assert.match(paid.html, /Payment received/);

  // Idempotent: relaying the same response again returns the order page.
  const again = await client.json("/api/helcim/confirm", {
    orderToken: checkout.data.orderToken,
    response: JSON.stringify({ data: { transactionId, status: "APPROVED" }, hash: "ignored" })
  });
  assert.equal(again.status, 200);
  assert.match(again.data.url, /paid=1/);

  // The admin order shows the processor reference.
  const admin = await client.text("/admin/orders");
  assert.match(admin.html, /Helcim Buyer/);
});

test("Helcim confirmation rejects a transaction that does not match the order", async (t) => {
  const stub = helcimStub();
  await new Promise((r) => stub.server.listen(0, "127.0.0.1", r));
  t.after(async () => { stub.server.close(); });

  const { server, client } = await setupInstance({
    preset: "restaurant",
    env: { HELCIM_API_TOKEN: "test-token", HELCIM_API_URL: `http://127.0.0.1:${stub.server.address().port}` }
  });
  t.after(async () => { await server.stop(); });

  const productId = await prepareStore({ client });
  const checkout = await client.json("/api/checkout", {
    items: [{ id: productId, qty: 2 }], name: "Careful Buyer", email: "careful@example.test",
    fulfilment: "pickup", payment_method: "helcim"
  });
  assert.equal(checkout.status, 200);

  // Transaction 4999 comes back from the stub with a different amount.
  const confirm = await client.json("/api/helcim/confirm", {
    orderToken: checkout.data.orderToken,
    response: JSON.stringify({ data: { transactionId: "4999", status: "APPROVED" }, hash: "ignored" })
  });
  assert.equal(confirm.status, 400);
  assert.match(confirm.data.error, /does not match/);

  const still = await client.text(`/order/${checkout.data.orderToken}`);
  assert.match(still.html, /Card payment pending/);
});

test("Helcim webhook verifies signatures and marks the order paid", async (t) => {
  const stub = helcimStub();
  await new Promise((r) => stub.server.listen(0, "127.0.0.1", r));
  t.after(async () => { stub.server.close(); });

  const { server, client } = await setupInstance({
    preset: "restaurant",
    env: {
      HELCIM_API_TOKEN: "test-token",
      HELCIM_API_URL: `http://127.0.0.1:${stub.server.address().port}`,
      HELCIM_WEBHOOK_VERIFIER: VERIFIER_TOKEN
    }
  });
  t.after(async () => { await server.stop(); });

  const productId = await prepareStore({ client });
  const checkout = await client.json("/api/checkout", {
    items: [{ id: productId, qty: 1 }], name: "Webhook Buyer", email: "hook@example.test",
    fulfilment: "pickup", payment_method: "helcim"
  });
  assert.equal(checkout.status, 200);
  const pending = await client.text(`/order/${checkout.data.orderToken}`);
  assert.match(pending.html, /Card payment pending/);

  // A correctly signed cardTransaction event confirms the order.
  const body = JSON.stringify({ id: checkout.data.helcim.checkoutToken.replace("tok_", ""), type: "cardTransaction" });
  const timestamp = Math.floor(Date.now() / 1000);
  const webhook = await fetch(`${server.base}/api/card-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": "msg_test123",
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${helcimSignature(body, "msg_test123", timestamp)}`
    },
    body
  });
  assert.equal(webhook.status, 200);

  // Wait a beat for the awaited handler to finish marking the order paid.
  for (let i = 0; i < 20; i++) {
    const page = await client.text(`/order/${checkout.data.orderToken}`);
    if (/Paid in full/.test(page.html)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.fail("the webhook never marked the order paid");
});

test("Helcim webhook rejects forged signatures", async (t) => {
  const { server, client } = await setupInstance({
    preset: "restaurant",
    env: { HELCIM_API_TOKEN: "test-token", HELCIM_API_URL: "http://127.0.0.1:9", HELCIM_WEBHOOK_VERIFIER: VERIFIER_TOKEN }
  });
  t.after(async () => { await server.stop(); });

  const body = JSON.stringify({ id: "424242", type: "cardTransaction" });
  const timestamp = Math.floor(Date.now() / 1000);
  const bad = await fetch(`${server.base}/api/card-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": "msg_evil",
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${Buffer.from("forged-signature-attempt").toString("base64")}`
    },
    body
  });
  assert.equal(bad.status, 401);

  // Stale timestamps are rejected even with a valid signature.
  const old = await fetch(`${server.base}/api/card-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": "msg_old",
      "webhook-timestamp": String(timestamp - 3600),
      "webhook-signature": `v1,${helcimSignature(body, "msg_old", timestamp - 3600)}`
    },
    body
  });
  assert.equal(old.status, 401);
});
