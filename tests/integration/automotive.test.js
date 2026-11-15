import test from "node:test";
import assert from "node:assert/strict";
import { setupInstance, firstMatch } from "../helpers.js";
import { addDays } from "../../src/core/util.js";

const TZ = "America/Edmonton";

function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

test("automotive deployment: services, booking, capacity, time off", async (t) => {
  const { server, client } = await setupInstance({ preset: "auto-repair" });
  t.after(async () => { await server.stop(); });

  let serviceId = "";
  let date = "";
  let slot = "";

  await t.test("services are published with prices and durations", async () => {
    const services = await client.text("/services");
    assert.equal(services.status, 200);
    assert.match(services.html, /Oil &amp; filter change|Oil & filter change/);
    assert.match(services.html, /\$89/);
    assert.match(services.html, /45 min/);
    serviceId = firstMatch(services.html, /\/book\?service=(svc_[^"&]+)/);
    assert.ok(serviceId);

    const slug = firstMatch(services.html, /href="\/services\/([^"]+)"/);
    const detail = await client.text(`/services/${slug}`);
    assert.equal(detail.status, 200);
    assert.match(detail.html, /Book this service/);
  });

  await t.test("available slots are generated from hours, not stored", async () => {
    for (let i = 0; i < 21 && !slot; i++) {
      const candidate = addDays(todayLocal(), i);
      const page = await client.text(`/book?service=${serviceId}&date=${candidate}`);
      assert.equal(page.status, 200);
      slot = firstMatch(page.html, /name="starts_at" value="([^"]+)"\s+required/);
      if (slot) date = candidate;
    }
    assert.ok(slot, "a bookable slot exists in the next three weeks");
    const api = await client.get(`/api/availability?service=${serviceId}&date=${date}`);
    const data = await api.json();
    assert.equal(data.date, date);
    assert.ok(data.slots.some((s) => s.available));
  });

  let bookingUrl = "";
  await t.test("a customer can book a slot", async () => {
    const res = await client.post("/book", {
      service_id: serviceId,
      date,
      starts_at: slot,
      name: "Dana Driver",
      email: "dana@example.test",
      phone: "4035550199",
      notes: "Brake squeal"
    });
    assert.equal(res.status, 302);
    bookingUrl = res.headers.get("location");
    assert.match(bookingUrl, /^\/booking\/bt_/);
    const page = await client.text(bookingUrl);
    assert.equal(page.status, 200);
    assert.match(page.html, /Dana Driver/);
    assert.match(page.html, /Request received|confirmed/i);
  });

  await t.test("the slot is held: capacity one rejects a second booking", async () => {
    const res = await client.post("/book", {
      service_id: serviceId, date, starts_at: slot,
      name: "Second Customer", email: "second@example.test", phone: "4035550100"
    });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") || "", /error=/);
    const page = await client.text(res.headers.get("location"));
    assert.match(page.html, /no longer available/);
  });

  await t.test("the back office sees and confirms the booking", async () => {
    const list = await client.text(`/admin/bookings?date=${date}`);
    assert.equal(list.status, 200);
    assert.match(list.html, /Dana Driver/);
    const id = firstMatch(list.html, /\/admin\/bookings\/(\d+)\/status/);
    assert.ok(id);
    const updated = await client.post(`/admin/bookings/${id}/status`, { status: "confirmed" });
    assert.equal(updated.status, 302);
    const after = await client.text(bookingUrl);
    assert.match(after.html, /Confirmed/);
  });

  await t.test("a closure blocks every slot that day", async () => {
    const res = await client.post("/admin/closures", {
      starts_at: `${date}T00:00`,
      ends_at: `${date}T23:59`,
      reason: "Training day"
    });
    assert.equal(res.status, 302);
    const api = await client.get(`/api/availability?service=${serviceId}&date=${date}`);
    const data = await api.json();
    assert.ok(data.slots.length > 0);
    assert.equal(data.slots.every((s) => !s.available), true);
  });

  await t.test("booking rules are configurable without code", async () => {
    const saved = await client.post("/admin/settings/bookings", {
      slotIntervalMin: "30", leadHours: "0", maxAdvanceDays: "30",
      confirmationMode: "auto", requirePhone: "1", allowStaffChoice: "0",
      bookingPrefix: "APT-", closedMessage: "Fully booked."
    });
    assert.equal(saved.status, 302);
    const home = await client.text("/");
    assert.equal(home.status, 200);
  });
});
