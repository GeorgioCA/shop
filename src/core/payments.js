// Payment adapter. Stripe when configured; offline methods always work.
// A sale must never depend on the payment provider being reachable.

import crypto from "node:crypto";
import Stripe from "stripe";
import { isEnabled } from "./modules.js";
import { config } from "./config.js";
import { money, str } from "./util.js";

let client = null;
let clientKey = "";

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function onlinePaymentsAvailable() {
  return stripeConfigured() && isEnabled("payments") && !!config().commerce.onlinePayments;
}

// Tests and demos can complete a card checkout without a Stripe account. It is
// only ever on when explicitly requested by the deployment environment.
export function demoPayments() {
  return process.env.PAYMENTS_DEMO === "1" || (process.env.DEMO_MODE === "1" && !stripeConfigured());
}

export function anyOnlineMode() {
  return onlinePaymentsAvailable() || helcimAvailable() || demoPayments();
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }
  return client;
}

export async function createCheckoutSession({ order, items, successUrl, cancelUrl }) {
  const s = stripe();
  if (!s) throw new Error("Card payments are not configured.");
  const { currency, locale } = config().business;

  const lineItems = items.map((it) => ({
    quantity: it.qty,
    price_data: {
      currency: currency.toLowerCase(),
      unit_amount: it.unit_price_cents,
      product_data: { name: it.name }
    }
  }));

  // Fees, tax and tips ride as one adjustment line so the Stripe total matches
  // the order row exactly; a separate tax_rate would round independently.
  const extras = order.total_cents - items.reduce((n, it) => n + it.line_total_cents, 0);
  if (extras > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: extras,
        product_data: { name: [order.delivery_cents ? "Delivery" : "", order.tax_cents ? config().commerce.taxLabel : "", order.tip_cents ? "Tip" : ""].filter(Boolean).join(" · ") || "Adjustments" }
      }
    });
  }

  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: order.email,
    client_reference_id: String(order.id),
    metadata: { order_number: order.number, order_id: String(order.id) },
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: "auto",
    ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { automatic_tax: { enabled: true } } : {})
  });
  return session;
}

export function constructEvent(rawBody, signature) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) throw new Error("Stripe webhook is not configured.");
  return s.webhooks.constructEvent(rawBody, signature, secret);
}

export { stripe };

/* --------------------------------- Helcim --------------------------------- */

// Helcim (helcim.com) is a Canadian processor; card payments run through
// HelcimPay.js — a hosted modal, like Stripe Checkout but embedded. The
// customer's browser posts the transaction response back to us and we never
// trust it directly: the transaction is read back from the Helcim API and only
// then is the order marked paid. A signed webhook covers closed-tab cases.
//
// Operator setup (Helcim dashboard):
//   1. API Access Configuration with the HelcimPay checkout option enabled and
//      the site's checkout URL whitelisted (required in production).
//   2. Webhooks on, delivery URL = {PUBLIC_BASE_URL}/api/card-webhook
//      (Helcim rejects delivery URLs containing the word "Helcim").
//   3. HELCIM_API_TOKEN / HELCIM_WEBHOOK_VERIFIER in the environment.

export function helcimConfigured() {
  return !!process.env.HELCIM_API_TOKEN;
}

export const helcimApiUrl = () => (process.env.HELCIM_API_URL || "https://api.helcim.com/v2").replace(/\/+$/, "");

export function helcimAvailable() {
  return helcimConfigured() && isEnabled("payments") && !!config().commerce.onlinePayments &&
    ["CAD", "USD"].includes(config().business.currency);
}

// Expose the currency support check so the checkout view can explain it.
export const helcimCurrencySupported = (currency) => ["CAD", "USD"].includes(currency);

function helcimFetch(path, options = {}) {
  return fetch(`${helcimApiUrl()}${path}`, {
    ...options,
    headers: {
      "api-token": process.env.HELCIM_API_TOKEN,
      accept: "application/json",
      "content-type": "application/json",
      ...options.headers
    },
    signal: AbortSignal.timeout(15_000)
  });
}

const helcimAddress = (order) => {
  const b = config().business;
  const country = /^(us|united states)/i.test(b.country || "") ? "USA" : "CAN";
  const region = String(b.region || "").trim();
  return {
    name: order.name,
    street1: order.address || str(b.address1, 200) || "n/a",
    city: str(b.city, 80) || undefined,
    province: region.slice(0, 2).toUpperCase() || undefined,
    country,
    postalCode: str(b.postal, 20) || "H0H0H0",
    email: order.email
  };
};

/**
 * Create a HelcimPay.js checkout session for one order.
 * Returns { checkoutToken } for the browser modal. An itemised invoice is
 * created in Helcim under the order's number, which is what binds a webhook
 * event (or a read-back) to this order.
 */
export async function createHelcimSession({ order, items }) {
  const currency = config().business.currency;
  if (!helcimCurrencySupported(currency)) {
    throw new Error("Helcim card payments support CAD and USD only.");
  }
  const subtotalLines = items.map((it) => ({
    description: `${it.name} × ${it.qty}`,
    quantity: it.qty,
    price: Number((it.unit_price_cents / 100).toFixed(2)),
    total: Number((it.line_total_cents / 100).toFixed(2))
  }));
  // Fees, tax, tip and the discount's effect ride as one adjustment line so
  // the invoice and the charged amount match the order row exactly.
  const extras = order.total_cents - items.reduce((n, it) => n + it.line_total_cents, 0);
  const lineItems = extras > 0
    ? [...subtotalLines, {
        description: [order.delivery_cents ? "Delivery" : "", order.tax_cents ? config().commerce.taxLabel : "", order.tip_cents ? "Tip" : ""].filter(Boolean).join(" · ") || "Adjustments",
        quantity: 1,
        price: Number((extras / 100).toFixed(2)),
        total: Number((extras / 100).toFixed(2))
      }]
    : subtotalLines;

  const notes = [];
  if (order.discount_cents) notes.push(`Discount ${order.discount_code} −${money(order.discount_cents, currency)}`);
  if (order.tax_cents) notes.push(`${config().commerce.taxLabel} ${money(order.tax_cents, currency)}`);
  if (order.delivery_cents) notes.push(`Delivery ${money(order.delivery_cents, currency)}`);
  if (order.tip_cents) notes.push(`Tip ${money(order.tip_cents, currency)}`);
  if (order.fulfilment === "delivery" && order.address) notes.push(`Deliver to: ${order.address}`);
  if (order.fulfilment === "pickup") notes.push(`Pickup at ${[config().business.address1, config().business.city].filter(Boolean).join(", ") || "the store"}`);

  const body = {
    paymentType: "purchase",
    amount: Number((order.total_cents / 100).toFixed(2)),
    currency,
    confirmationScreen: true,
    language: String(config().business.locale || "en-CA").startsWith("fr") ? "fr" : "en",
    customStyling: {
      appearance: "light",
      brandColor: String(config().theme.primary || "#1f5c4a").replace("#", ""),
      cornerRadius: { sharp: "rectangular", soft: "rounded", round: "pill" }[config().theme.radius] || "rounded",
      ctaButtonText: "order"
    },
    customerRequest: { contactName: order.name || "Customer", cellPhone: order.phone || undefined },
    invoiceRequest: {
      invoiceNumber: order.number,
      contactName: order.name || "Customer",
      notes: notes.join(" · "),
      lineItems
    }
  };

  const res = await helcimFetch("/helcim-pay/initialize", { method: "POST", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.checkoutToken) {
    const errors = Array.isArray(data.errors) ? data.errors.join(", ") : `HTTP ${res.status}`;
    throw new Error(`Helcim could not start the payment: ${errors}`);
  }
  return { checkoutToken: data.checkoutToken, secretToken: data.secretToken };
}

/** Authoritative transaction record straight from Helcim. */
export async function helcimTransaction(transactionId) {
  const id = String(transactionId || "").replace(/\D/g, "");
  if (!id) throw new Error("Missing transaction id.");
  const res = await helcimFetch(`/card-transactions/${id}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = Array.isArray(data.errors) ? data.errors.join(", ") : `HTTP ${res.status}`;
    throw new Error(`Helcim read-back failed: ${errors}`);
  }
  return data;
}

/**
 * Confirm a transaction against one order: the transaction must be an approved
 * purchase, in the order's currency, for exactly the order's total, and (when
 * Helcim recorded it) carry the order's invoice number.
 */
export function helcimPaymentMatches(order, transaction) {
  const amountCents = Math.round(Number(transaction?.amount) * 100);
  return (
    String(transaction?.status).toUpperCase() === "APPROVED" &&
    String(transaction?.type).toLowerCase() === "purchase" &&
    String(transaction?.currency).toUpperCase() === String(order.currency).toUpperCase() &&
    amountCents === order.total_cents &&
    (!transaction?.invoiceNumber || String(transaction.invoiceNumber) === String(order.number))
  );
}

// Webhook signature verification (Standard Webhooks format):
//   signedContent = `${webhook-id}.${webhook-timestamp}.${rawBody}`
//   signature     = base64(HMAC-SHA256(base64decode(verifierToken), signedContent))
// The header may carry a space-delimited list ("v1,sigA v2,sigB"); any match wins.
export function verifyHelcimWebhook({ headers, rawBody }) {
  const verifier = process.env.HELCIM_WEBHOOK_VERIFIER;
  if (!verifier) throw new Error("Helcim webhook verifier is not configured.");
  const signatureHeader = String(headers["webhook-signature"] || "");
  const webhookId = String(headers["webhook-id"] || "");
  const timestamp = Number(headers["webhook-timestamp"] || 0);
  if (!signatureHeader || !webhookId || !timestamp) return false;
  // Replay guard: Helcim re-signs every delivery attempt, so a fresh timestamp
  // is expected. Ten minutes covers clock skew.
  if (Math.abs(Date.now() / 1000 - timestamp) > 600) return false;
  const key = Buffer.from(verifier, "base64");
  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  for (const entry of signatureHeader.split(/\s+/)) {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}
