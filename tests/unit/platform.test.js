// Pure-logic and database-backed unit tests. Each test file runs in its own
// process, so the DATA_DIR set here is the only database this file touches.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "shop-unit-"));
process.env.SESSION_SECRET = "unit-test-secret-0123456789";

const util = await import("../../src/core/util.js");
const { ensureModules, setModuleEnabled, isEnabled, allModules, missingDependencies } = await import("../../src/core/modules.js");
const { loadConfig, saveConfig, config, coerceFields } = await import("../../src/core/config.js");
const { saveProduct, listProducts } = await import("../../src/modules/catalog.js");
const { saveDiscount, evaluateDiscount } = await import("../../src/modules/discounts.js");
const { quote } = await import("../../src/modules/orders.js");
const { availability } = await import("../../src/modules/bookings.js");

ensureModules();
loadConfig();

test("money and input parsing never produce floats", () => {
  assert.equal(util.money(1600, "CAD", "en-CA").replace(/\s/g, " "), "$16");
  assert.equal(util.money(1625, "CAD", "en-CA").replace(/\s/g, " "), "$16.25");
  assert.equal(util.parseCents("12.50"), 1250);
  assert.equal(util.parseCents("$1,234.56"), 123456);
  assert.equal(util.parseCents(""), null);
  assert.equal(util.parseCents("banana"), null);
  assert.equal(util.centsInput(1250), "12.50");
});

test("timezone conversion handles standard time, daylight time and DST edges", () => {
  const tz = "America/Edmonton";
  assert.equal(util.zonedToUtc(2026, 1, 15, 9, 0, tz).toISOString(), "2026-01-15T16:00:00.000Z"); // MST
  assert.equal(util.zonedToUtc(2026, 7, 15, 9, 0, tz).toISOString(), "2026-07-15T15:00:00.000Z"); // MDT
  // 2026-03-08 02:30 does not exist; the conversion must still land on a real instant.
  const spring = util.zonedToUtc(2026, 3, 8, 2, 30, tz);
  assert.ok(!Number.isNaN(spring.getTime()));
  const local = util.localParts(spring, tz);
  assert.equal(local.hour, 3); // springs forward to 03:30
  assert.equal(util.localDateStr("2026-11-15T03:30:00Z", tz), "2026-11-14");
  assert.equal(util.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(util.dayOfWeek("2026-11-15"), 0);
});

test("slugs are stable, unique and readable", () => {
  assert.equal(util.slugify("Wood-fired chicken & salsa"), "wood-fired-chicken-and-salsa");
  assert.equal(util.slugify("Café crème"), "cafe-creme");
  const taken = new Set(["test", "test-2"]);
  assert.equal(util.uniqueSlug("Test", (s) => taken.has(s)), "test-3");
});

test("configuration rejects invalid values instead of storing them", () => {
  assert.throws(() => coerceFields("theme", { primary: "red" }), /hex colour/);
  assert.throws(() => coerceFields("business", { email: "not-an-email" }), /valid email/);
  assert.throws(() => coerceFields("business", { currency: "XYZ" }), /must be one of/);
  const ok = coerceFields("commerce", { deliveryFeeCents: "12.50", taxRatePct: "5", pickupEnabled: "on" });
  assert.equal(ok.deliveryFeeCents, 1250);
  assert.equal(ok.taxRatePct, 5);
  assert.equal(ok.pickupEnabled, 1);
});

test("saving configuration round-trips and repaints the cache", () => {
  saveConfig("business", { name: "Unit Test Co", tagline: "Testing" });
  assert.equal(config().business.name, "Unit Test Co");
  saveConfig("hours", { hours: { mon: { closed: false, open: "10:00", close: "16:00" } } });
  assert.equal(config().hours.hours.mon.open, "10:00");
  assert.equal(config().hours.hours.tue.open, "09:00", "unspecified days keep their defaults");
});

test("module dependencies are enforced in both directions", () => {
  assert.deepEqual(missingDependencies("bookings"), ["services"]);
  const fail = setModuleEnabled("bookings", true);
  assert.equal(fail.ok, false);
  assert.match(fail.error, /needs Service catalog/);

  assert.equal(setModuleEnabled("services", true).ok, true);
  assert.equal(setModuleEnabled("bookings", true).ok, true);
  assert.ok(isEnabled("bookings"));

  const refuse = setModuleEnabled("services", false);
  assert.equal(refuse.ok, false);
  assert.match(refuse.error, /used by Appointments/);

  const cascade = setModuleEnabled("services", false, { cascade: true });
  assert.equal(cascade.ok, true);
  assert.deepEqual(cascade.disabled, ["bookings"]);
  assert.equal(isEnabled("bookings"), false);
  assert.equal(allModules().length, 14);
});

test("discount codes evaluate consistently and respect limits", () => {
  saveConfig("commerce", { currency: "CAD" });
  saveDiscount({ code: "TEN", kind: "percent", value: 10, active: 1 });
  saveDiscount({ code: "FIVE", kind: "fixed", value: "5.00", min_subtotal: "20.00", active: 1 });
  saveDiscount({ code: "OLD", kind: "percent", value: 20, expires_at: "2020-01-01", active: 1 });

  const ten = evaluateDiscount("ten", 10000);
  assert.equal(ten.ok, true);
  assert.equal(ten.amountCents, 1000);

  assert.equal(evaluateDiscount("FIVE", 1000).ok, false);
  assert.equal(evaluateDiscount("FIVE", 2500).amountCents, 500);
  assert.equal(evaluateDiscount("OLD", 10000).ok, false);
  assert.equal(evaluateDiscount("NOPE", 10000).ok, false);
});

test("order pricing applies delivery, tax and discounts on the server", () => {
  saveConfig("commerce", {
    taxRatePct: 5, taxLabel: "GST", taxDelivery: 0,
    deliveryEnabled: 1, deliveryFeeCents: 500, deliveryFreeOverCents: 5000,
    tipsEnabled: 1, tipPresets: "10,15", minOrderCents: 0
  });
  setModuleEnabled("delivery", true, { cascade: true });
  setModuleEnabled("commerce", true);

  const p = saveProduct({ name: "Pricing Widget", price: "20.00", active: 1, max_per_order: 10 });
  assert.equal(listProducts({ activeOnly: true }).length, 1);

  const pickup = quote({ items: [{ id: p.id, qty: 1 }], fulfilment: "pickup" });
  assert.equal(pickup.subtotalCents, 2000);
  assert.equal(pickup.deliveryCents, 0);
  assert.equal(pickup.taxCents, 100);
  assert.equal(pickup.totalCents, 2100);

  const delivery = quote({ items: [{ id: p.id, qty: 1 }], fulfilment: "delivery", tipCents: 300 });
  assert.equal(delivery.deliveryCents, 500);
  assert.equal(delivery.taxCents, 100, "delivery is not taxed when taxDelivery is off");
  assert.equal(delivery.tipCents, 300);
  assert.equal(delivery.totalCents, 2000 + 500 + 100 + 300);

  const free = quote({ items: [{ id: p.id, qty: 3 }], fulfilment: "delivery" });
  assert.equal(free.deliveryCents, 0, "free over the threshold");

  const withCode = quote({ items: [{ id: p.id, qty: 1 }], fulfilment: "pickup", code: "TEN" });
  assert.equal(withCode.discountCents, 200);
  assert.equal(withCode.totalCents, 1890);

  assert.equal(quote({ items: [{ id: p.id, qty: 99 }], fulfilment: "pickup" }).ok, false);
  assert.equal(quote({ items: [{ id: "missing", qty: 1 }], fulfilment: "pickup" }).ok, false);
});

test("booking availability respects hours, lead time and closures", async () => {
  saveConfig("hours", { hours: { sun: { closed: false, open: "09:00", close: "11:00" } } });
  saveConfig("bookings", { slotIntervalMin: 30, leadHours: 0, maxAdvanceDays: 365, confirmationMode: "auto" });
  const { saveService } = await import("../../src/modules/services.js");
  const svc = saveService({ name: "Unit Service", price: "50", duration_min: 60, buffer_min: 30, capacity: 1, active: 1 });
  const day = availability(svc, "2027-06-06"); // a Sunday, far in the future
  assert.equal(day.closed, false);
  assert.ok(day.slots.length >= 1);
  assert.equal(day.slots[0].label, "9:00 a.m.");
  // 09:00-10:00 with a 30 min buffer, next slot may start at 09:30 only if it does not overlap.
  const overlapping = day.slots.filter((s) => s.available);
  assert.ok(overlapping.length >= 1);
});
