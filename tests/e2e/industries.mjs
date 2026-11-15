// End-to-end validation of three independent deployments at desktop and phone
// sizes. Exercises the real UI (cart, booking, contact, admin) and screenshots
// each configuration for visual review.

import { chromium } from "playwright-core";
import { setupInstance } from "../helpers.js";
import fs from "node:fs";
import path from "node:path";

const EXECUTABLE = process.env.CHROME_PATH || "/root/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome";
const OUT = process.env.SHOT_DIR || "/tmp/shop-shots";
fs.mkdirSync(OUT, { recursive: true });

const scenarios = [
  {
    key: "restaurant",
    label: "Restaurant",
    async exercise(page, base) {
      await page.goto(`${base}/shop`, { waitUntil: "networkidle" });
      await page.locator("[data-add-to-cart]:not([disabled])").first().click();
      await page.waitForSelector(".cart-drawer.is-open");
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `${this.key}-cart.png`), fullPage: false });
      await page.locator("[data-cart-checkout]").click();
      await page.waitForURL("**/checkout");
      await page.fill('input[name="name"]', "Playwright Diner");
      await page.fill('input[name="email"]', "diner@example.test");
      await page.fill('input[name="phone"]', "4035550123");
      await page.fill('textarea[name="notes"]', "Leave at the door");
      await page.waitForFunction(() => document.querySelector("[data-checkout-submit]")?.disabled === false);
      await page.click("[data-checkout-submit]");
      await page.waitForURL("**/order/**", { timeout: 15000 });
      return (await page.textContent("body")) || "";
    },
    expect: (body) => body.includes("Playwright Diner") || body.includes("your order is")
  },
  {
    key: "auto-repair",
    label: "Automotive",
    async exercise(page, base) {
      await page.goto(`${base}/book`, { waitUntil: "networkidle" });
      await page.locator(".service-card a", { hasText: "Book" }).first().click();
      await page.waitForURL("**/book?service=**");
      // Find the first date in the strip that has a bookable slot.
      for (let i = 0; i < 14; i++) {
        if (await page.locator('input[name="starts_at"]:not([disabled])').count()) break;
        const chips = page.locator(".day-chip");
        if (i === 0) await chips.nth(0).click();
        else await chips.nth(Math.min(i, (await chips.count()) - 1)).click();
        await page.waitForLoadState("networkidle");
      }
      const slot = page.locator('input[name="starts_at"]:not([disabled])').first();
      await slot.check({ force: true });
      await page.fill('input[name="name"]', "Playwright Driver");
      await page.fill('input[name="email"]', "driver@example.test");
      await page.fill('input[name="phone"]', "4035550456");
      await page.fill('textarea[name="notes"]', "Front brakes squeal");
      await page.click('.booking-form button[type="submit"]');
      await page.waitForURL("**/booking/**", { timeout: 15000 });
      return (await page.textContent("body")) || "";
    },
    expect: (body) => body.includes("Playwright Driver") || body.includes("Request received") || body.includes("booked")
  },
  {
    key: "professional-services",
    label: "Professional services",
    async exercise(page, base) {
      await page.goto(`${base}/contact`, { waitUntil: "networkidle" });
      await page.fill('input[name="name"]', "Playwright Client");
      await page.fill('input[name="email"]', "client@example.test");
      await page.fill('input[name="subject"]', "Year-end question");
      await page.fill('textarea[name="message"]', "We need help with our year-end filing this spring.");
      await page.click('button[type="submit"]');
      await page.waitForURL("**/contact?sent=1", { timeout: 15000 });
      return (await page.textContent("body")) || "";
    },
    expect: (body) => body.includes("your message is in") || body.includes("Thanks")
  }
];

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });
const results = [];
let failures = 0;

for (const scenario of scenarios) {
  const { server, client } = await setupInstance({ preset: scenario.key });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  desktop.on("pageerror", (e) => errors.push(String(e)));
  desktop.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await desktop.goto(`${server.base}/`, { waitUntil: "networkidle" });
    await desktop.screenshot({ path: path.join(OUT, `${scenario.key}-home-desktop.png`), fullPage: true });
    const body = await scenario.exercise(desktop, server.base);
    await desktop.screenshot({ path: path.join(OUT, `${scenario.key}-after.png`), fullPage: true });

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await phone.goto(`${server.base}/`, { waitUntil: "networkidle" });
    await phone.screenshot({ path: path.join(OUT, `${scenario.key}-home-phone.png`), fullPage: true });
    await phone.goto(`${server.base}/admin/login`, { waitUntil: "networkidle" });
    await phone.close();

    // Admin at desktop, signed in through the real form.
    const admin = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await admin.goto(`${server.base}/admin/login`, { waitUntil: "networkidle" });
    await admin.fill('input[name="email"]', "owner@example.test");
    await admin.fill('input[name="password"]', "test-password-123");
    await admin.click('button[type="submit"]');
    await admin.waitForURL("**/admin", { timeout: 15000 });
    await admin.screenshot({ path: path.join(OUT, `${scenario.key}-admin.png`), fullPage: true });
    await admin.goto(`${server.base}/admin/theme`, { waitUntil: "networkidle" });
    await admin.screenshot({ path: path.join(OUT, `${scenario.key}-theme.png`), fullPage: true });
    await admin.close();

    const ok = scenario.expect(body) && errors.length === 0;
    results.push({ key: scenario.key, ok, errors, bodySnippet: body.slice(0, 120) });
    if (!ok) failures++;
  } catch (err) {
    failures++;
    results.push({ key: scenario.key, ok: false, errors: [...errors, err.message] });
    try { await desktop.screenshot({ path: path.join(OUT, `${scenario.key}-failure.png`), fullPage: true }); } catch { /* ignore */ }
  } finally {
    await desktop.close();
    await server.stop();
  }
}

await browser.close();
console.log(JSON.stringify({ out: OUT, failures, results }, null, 2));
process.exit(failures ? 1 : 0);
