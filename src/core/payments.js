// Payment adapter. Stripe when configured; offline methods always work.
// A sale must never depend on the payment provider being reachable.

import Stripe from "stripe";
import { isEnabled } from "./modules.js";
import { config } from "./config.js";

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
  return onlinePaymentsAvailable() || demoPayments();
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

export async function refundHint() {
  return "Refunds are issued from the Stripe dashboard.";
}

export { stripe };
