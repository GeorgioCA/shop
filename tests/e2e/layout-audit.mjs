import { chromium } from "playwright-core";
import { setupInstance } from "../helpers.js";

const EXECUTABLE = "/root/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome";
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });

for (const preset of ["restaurant", "auto-repair", "professional-services", "retail-general"]) {
  const { server } = await setupInstance({ preset });
  for (const [label, viewport] of [["desktop", { width: 1440, height: 960 }], ["phone", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${server.base}/`, { waitUntil: "networkidle" });
    const audit = await page.evaluate(() => {
      const vw = window.innerWidth;
      const overflow = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > vw + 2 || r.left < -2)) {
          overflow.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
        }
      }
      const h1 = document.querySelector("h1");
      const header = document.querySelector(".site-header");
      const footer = document.querySelector(".site-footer");
      return {
        vw,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: overflow.slice(0, 6),
        h1: h1 ? { size: getComputedStyle(h1).fontSize, text: h1.textContent.trim().slice(0, 60) } : null,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        headerH: header ? Math.round(header.getBoundingClientRect().height) : 0,
        footerH: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
        cards: document.querySelectorAll(".product-card, .service-card").length,
        sections: document.querySelectorAll("main section").length,
        font: getComputedStyle(document.body).fontFamily.slice(0, 40)
      };
    });
    console.log(preset, label, JSON.stringify(audit));
    await page.close();
  }
  await server.stop();
}
await browser.close();
