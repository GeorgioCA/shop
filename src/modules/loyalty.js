// Loyalty points: earned on paid orders, redeemed at checkout.
// 100 points = $5 by default; both knobs live in module config.

import { db } from "../core/db.js";
import { moduleConfig, isEnabled } from "../core/modules.js";
import { addPoints } from "./customers.js";

export function loyaltySettings() {
  const c = moduleConfig("loyalty");
  return {
    pointsPerDollar: Number(c.pointsPerDollar ?? 1),
    redeemCentsPer100: Number(c.redeemCentsPer100 ?? 500),
    maxRedeemPercent: Number(c.maxRedeemPercent ?? 50)
  };
}

export function awardPoints(customerId, totalCents, orderId) {
  if (!isEnabled("loyalty") || !customerId) return 0;
  const { pointsPerDollar } = loyaltySettings();
  const points = Math.floor((totalCents / 100) * pointsPerDollar);
  if (points > 0) addPoints(customerId, points, `Earned on order`, orderId);
  return points;
}

export function redeemable(customerId, subtotalCents) {
  if (!isEnabled("loyalty") || !customerId) return { points: 0, cents: 0 };
  const { redeemCentsPer100, maxRedeemPercent } = loyaltySettings();
  const available = db.prepare("SELECT COALESCE(SUM(points),0) AS n FROM loyalty_ledger WHERE customer_id = ?").get(customerId).n;
  const cap = Math.floor((subtotalCents * Math.min(100, maxRedeemPercent)) / 100);
  const cents = Math.min(cap, Math.floor(available / 100) * redeemCentsPer100);
  return { points: Math.ceil(cents / redeemCentsPer100) * 100, cents, available };
}
