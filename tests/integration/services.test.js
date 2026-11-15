import test from "node:test";
import assert from "node:assert/strict";
import { setupInstance, firstMatch } from "../helpers.js";

test("professional services deployment: inquiries, no unwanted modules", async (t) => {
  const { server, client } = await setupInstance({ preset: "professional-services" });
  t.after(async () => { await server.stop(); });

  await t.test("the site shows services and no product storefront", async () => {
    const home = await client.text("/");
    assert.equal(home.status, 200);
    assert.match(home.html, /Harbour Accounting/);
    assert.match(home.html, /Your books, closed on time/);
    assert.equal((await client.get("/shop")).status, 404);
    const services = await client.text("/services");
    assert.equal(services.status, 200);
    assert.match(services.html, /Year-end financial statements/);
  });

  await t.test("a contact form creates an inquiry in the inbox", async () => {
    const contact = await client.text("/contact");
    assert.equal(contact.status, 200);
    assert.match(contact.html, /name="message"/);
    const res = await client.post("/contact", {
      name: "Priya Prospect",
      email: "priya@example.test",
      phone: "4035550177",
      subject: "Year-end help",
      message: "We are a three-person studio and need a year-end quote."
    });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /sent=1/);
    const inbox = await client.text("/admin/inquiries");
    assert.match(inbox.html, /Priya Prospect/);
    const detailLink = firstMatch(inbox.html, /href="\/admin\/inquiries\/(\d+)"/);
    assert.ok(detailLink);
    const detail = await client.text(`/admin/inquiries/${detailLink}`);
    assert.match(detail.html, /three-person studio/);
  });

  await t.test("bookings work for a consultancy", async () => {
    const page = await client.text("/book");
    assert.equal(page.status, 200);
    const serviceId = firstMatch(page.html, /\/book\?service=(svc_[^"&]+)/);
    assert.ok(serviceId);
    const servicePage = await client.text(`/book?service=${serviceId}`);
    assert.match(servicePage.html, /Book/);
  });

  await t.test("the account area is a sign-in page", async () => {
    const account = await client.text("/account");
    assert.equal(account.status, 200);
    assert.match(account.html, /Sign in/);
  });

  await t.test("an admin can add a new page with a section", async () => {
    const created = await client.post("/admin/pages", { title: "Fees", status: "published" });
    assert.equal(created.status, 302);
    const pageUrl = created.headers.get("location");
    const pageId = pageUrl.split("/").pop();
    await client.post(`/admin/pages/${pageId}/sections`, { type: "rich_text" });
    const editor = await client.text(pageUrl);
    const sectionId = firstMatch(editor.html, new RegExp(`/admin/pages/${pageId}/sections/([^"/]+)`));
    await client.post(`/admin/pages/${pageId}/sections/${sectionId}`, {
      type: "rich_text", title: "Fixed fees, agreed upfront", text: "No hourly billing.", align: "left", narrow: "1"
    });
    const live = await client.text("/p/fees");
    assert.equal(live.status, 200);
    assert.match(live.html, /Fixed fees, agreed upfront/);
  });

  await t.test("module dependencies are enforced", async () => {
    const res = await client.post("/admin/modules/bookings/toggle", { enabled: "0" });
    assert.equal(res.status, 302);
    const modules = await client.text("/admin/modules");
    assert.match(modules.html, /Appointments/);
    // services can be disabled now that bookings is off
    const off = await client.post("/admin/modules/services/toggle", { enabled: "0", cascade: "1" });
    assert.equal(off.status, 302);
    assert.equal((await client.get("/services")).status, 404);
  });
});
