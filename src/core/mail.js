// Transactional email. One send path, one log table, and a hard rule: email
// failure never fails a sale, a booking or a form submission.

import { db, insert } from "./db.js";
import { config } from "./config.js";
import { esc, money, nowIso } from "./util.js";

export function mailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function fromAddress() {
  const e = config().email;
  const email = e.fromEmail || process.env.EMAIL_FROM || "";
  const name = e.fromName || config().business.name;
  return email ? `${name} <${email}>` : "";
}

export function emailTemplate({ heading, intro, body = "", cta, footer = "" }) {
  const t = config().theme;
  const b = config().business;
  return `<!doctype html><html><body style="margin:0;background:${t.background};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${t.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.background};padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${t.surface};border:1px solid ${t.border};border-radius:14px;overflow:hidden">
        <tr><td style="padding:22px 26px;border-bottom:1px solid ${t.border}">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${t.muted}">${esc(b.name)}</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;color:${t.text}">${esc(heading)}</div>
        </td></tr>
        <tr><td style="padding:24px 26px;font-size:15px;line-height:1.6">
          ${intro ? `<p style="margin:0 0 16px">${intro}</p>` : ""}
          ${body}
          ${cta ? `<p style="margin:24px 0 4px"><a href="${esc(cta.url)}" style="display:inline-block;background:${t.primary};color:${t.primaryText};text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${esc(cta.label)}</a></p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 26px;border-top:1px solid ${t.border};font-size:12px;color:${t.muted}">
          ${footer || esc([b.address1, b.city, b.region].filter(Boolean).join(" · "))}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export async function sendMail({ to, subject, html, template = "", replyTo }) {
  const email = config().email;
  const recipient = String(to || "").trim();
  if (!recipient) return { ok: false, error: "No recipient" };
  const base = {
    to: recipient,
    subject,
    template,
    replyTo: replyTo || email.replyTo || undefined
  };

  if (!mailConfigured()) {
    insert("email_log", { ...row(base), status: "skipped", error: "RESEND_API_KEY not set", created_at: nowIso() });
    console.log(`[mail] skipped (no key): ${subject} -> ${recipient}`);
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress() || "onboarding@resend.dev",
        to: [recipient],
        subject,
        html,
        reply_to: base.replyTo
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      insert("email_log", { ...row(base), status: "failed", error: detail, created_at: nowIso() });
      console.error(`[mail] ${res.status} ${subject}: ${detail}`);
      return { ok: false, error: detail };
    }
    insert("email_log", { ...row(base), status: "sent", error: "", created_at: nowIso() });
    return { ok: true };
  } catch (err) {
    insert("email_log", { ...row(base), status: "failed", error: String(err.message).slice(0, 300), created_at: nowIso() });
    console.error(`[mail] ${subject}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

const row = (base) => ({
  to_email: base.to,
  subject: base.subject,
  template: base.template
});

const itemsTable = (order, items, currency, locale) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">
    ${items
      .map(
        (it) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${esc(it.name)} × ${it.qty}</td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #eee">${esc(money(it.line_total_cents, currency, locale))}</td>
      </tr>`
      )
      .join("")}
    <tr><td style="padding:10px 0;font-weight:700">Total</td><td align="right" style="padding:10px 0;font-weight:700">${esc(money(order.total_cents, currency, locale))}</td></tr>
  </table>`;

export async function sendOrderConfirmation(order, items, url) {
  if (!config().email.orderConfirmation) return { ok: false, skipped: true };
  const { currency, locale } = config().business;
  const c = config().commerce;
  const fulfilment =
    order.fulfilment === "delivery"
      ? `Delivery to ${esc(order.address)}. ${esc(c.deliveryInstructions)}`
      : order.fulfilment === "pickup"
        ? `Pickup. ${esc(c.pickupInstructions)}`
        : esc(c.offlineInstructions);
  const payment =
    order.payment_status === "paid"
      ? "Paid — thank you."
      : order.payment_method === "stripe"
        ? "Payment is being confirmed."
        : esc(c.offlineLabel) + ". " + esc(c.offlineInstructions);

  return sendMail({
    to: order.email,
    subject: `Order ${order.number} — ${config().business.name}`,
    template: "order_confirmation",
    replyTo: config().email.replyTo || undefined,
    html: emailTemplate({
      heading: "We have your order",
      intro: `Thanks, ${esc(order.name.split(" ")[0] || "there")}. Order <strong>${esc(order.number)}</strong> is ${esc(order.status)}.`,
      body: `${itemsTable(order, items, currency, locale)}<p style="margin:0 0 8px">${fulfilment}</p><p style="margin:0;color:#6b6560">${payment}</p>`,
      cta: url ? { label: "View your order", url } : null
    })
  });
}

export async function sendOrderStatus(order, url) {
  return sendMail({
    to: order.email,
    subject: `Order ${order.number} is ${order.status.replace(/_/g, " ")}`,
    template: "order_status",
    html: emailTemplate({
      heading: `Order ${order.number}`,
      intro: `Your order is now <strong>${esc(order.status.replace(/_/g, " "))}</strong>.`,
      body: `<p style="margin:0;color:#6b6560">${esc(config().commerce.pickupInstructions)}</p>`,
      cta: url ? { label: "View your order", url } : null
    })
  });
}

export async function sendBookingConfirmation(booking, service, url) {
  if (!config().email.bookingConfirmation) return { ok: false, skipped: true };
  const tz = config().business.timezone;
  const when = new Intl.DateTimeFormat(config().business.locale, {
    timeZone: tz, dateStyle: "full", timeStyle: "short"
  }).format(new Date(booking.starts_at));
  return sendMail({
    to: booking.email,
    subject: `${booking.status === "confirmed" ? "Confirmed" : "Received"}: ${service?.name || "appointment"} — ${config().business.name}`,
    template: "booking_confirmation",
    html: emailTemplate({
      heading: booking.status === "confirmed" ? "Your appointment is confirmed" : "We have your request",
      intro: `${esc(service?.name || "Appointment")} on <strong>${esc(when)}</strong>.`,
      body: `<p style="margin:0;color:#6b6560">Booking <strong>${esc(booking.number)}</strong>. Need to change it? Reply to this email.</p>`,
      cta: url ? { label: "View booking", url } : null
    })
  });
}

export async function sendInquiryAck(inquiry) {
  if (!config().email.inquiryAcknowledgement) return { ok: false, skipped: true };
  return sendMail({
    to: inquiry.email,
    subject: `We received your message — ${config().business.name}`,
    template: "inquiry_ack",
    html: emailTemplate({
      heading: "Thanks for getting in touch",
      intro: `Hi ${esc(inquiry.name.split(" ")[0] || "there")}, we have your message and will reply shortly.`,
      body: `<p style="margin:0;color:#6b6560">Your reference is <strong>${esc(inquiry.number)}</strong>.</p>`
    })
  });
}

export async function sendOwnerAlert(subject, lines, url) {
  const to = config().email.ownerEmail;
  if (!to) return { ok: false, skipped: true };
  return sendMail({
    to,
    subject: `[${config().business.name}] ${subject}`,
    template: "owner_alert",
    html: emailTemplate({
      heading: subject,
      intro: "",
      body: `<ul style="margin:0 0 8px;padding-left:18px">${lines.map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join("")}</ul>`,
      cta: url ? { label: "Open in the back office", url } : null
    })
  });
}

export function recentEmails(limit = 30) {
  return db.prepare("SELECT * FROM email_log ORDER BY id DESC LIMIT ?").all(limit);
}
