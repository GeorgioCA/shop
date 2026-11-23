// Storefront behaviour: navigation, cart and checkout. No framework, no build.

(() => {
  const cfg = window.__SHOP__ || { currency: "CAD", locale: "en-CA", minOrderCents: 0, maxItems: 50 };
  const CART_KEY = "shop_cart_v1";
  const csrf = () => (document.cookie.match(/(?:^|;\s*)shop_csrf=([^;]+)/) || [])[1] || "";
  const money = (cents) => {
    try {
      return new Intl.NumberFormat(cfg.locale, {
        style: "currency", currency: cfg.currency, minimumFractionDigits: Number(cents) % 100 === 0 ? 0 : 2
      }).format(Number(cents) / 100);
    } catch { return `$${(Number(cents) / 100).toFixed(2)}`; }
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ------------------------------ cart state ----------------------------- */
  function readCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((l) => l && l.id && l.qty > 0) : [];
    } catch { return []; }
  }
  function writeCart(lines) {
    localStorage.setItem(CART_KEY, JSON.stringify(lines.slice(0, cfg.maxItems || 50)));
    document.dispatchEvent(new CustomEvent("cart:change"));
  }
  const count = (lines) => lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = (lines) => lines.reduce((n, l) => n + l.price * l.qty, 0);

  function addLine(item) {
    const lines = readCart();
    const existing = lines.find((l) => l.id === item.id);
    if (existing) existing.qty = Math.min(item.max || 99, existing.qty + item.qty);
    else lines.push({ ...item, qty: Math.min(item.max || 99, item.qty) });
    writeCart(lines);
  }

  /* ------------------------------ drawer -------------------------------- */
  const drawer = document.querySelector(".cart-drawer");
  const backdrop = document.querySelector(".cart-backdrop");

  function openCart() {
    if (!drawer) return;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add("cart-open");
    const close = drawer.querySelector("[data-cart-close]");
    if (close) close.focus({ preventScroll: true });
  }
  function closeCart() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("cart-open");
  }

  function renderCart() {
    const lines = readCart();
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      const n = count(lines);
      el.textContent = n;
      el.hidden = n === 0;
    });
    const body = document.querySelector("[data-cart-items]");
    if (body) {
      body.innerHTML = lines.length
        ? lines.map((l) => `<div class="cart-line" data-line="${esc(l.id)}">
            ${l.image ? `<img class="cart-line-img" src="${esc(l.image)}" alt="">` : `<span class="cart-line-img"></span>`}
            <div class="cart-line-main"><strong>${esc(l.name)}</strong><small>${money(l.price)} each</small>
              <div class="qty" style="margin-top:.35rem">
                <button type="button" data-cart-dec aria-label="Decrease">−</button>
                <input class="input" type="number" value="${l.qty}" min="1" max="${l.max || 99}" data-cart-qty aria-label="Quantity">
                <button type="button" data-cart-inc aria-label="Increase">+</button>
              </div>
            </div>
            <div class="cart-line-right"><strong>${money(l.price * l.qty)}</strong><br>
              <button class="cart-remove" type="button" data-cart-remove aria-label="Remove">Remove</button></div>
          </div>`).join("")
        : `<p class="cart-empty">Your cart is empty.</p>`;
    }
    const total = document.querySelector("[data-cart-total]");
    if (total) total.textContent = lines.length ? money(subtotal(lines)) : "—";
    const checkoutBtn = document.querySelector("[data-cart-checkout]");
    if (checkoutBtn) {
      const below = cfg.minOrderCents > 0 && subtotal(lines) < cfg.minOrderCents;
      checkoutBtn.classList.toggle("is-disabled", !lines.length || below);
      checkoutBtn.setAttribute("aria-disabled", String(!lines.length || below));
    }
  }

  document.addEventListener("cart:change", renderCart);
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-cart-open]");
    if (open) { e.preventDefault(); openCart(); return; }
    const close = e.target.closest("[data-cart-close]");
    if (close) { e.preventDefault(); closeCart(); return; }
    if (backdrop && e.target === backdrop) { closeCart(); return; }

    const add = e.target.closest("[data-add-to-cart]");
    if (add && !add.disabled) {
      e.preventDefault();
      let id = add.dataset.id;
      let price = Number(add.dataset.price) || 0;
      let name = add.dataset.name || "Item";
      const selId = add.dataset.variantSelect;
      if (selId) {
        const sel = document.getElementById(selId);
        if (sel) {
          const opt = sel.options[sel.selectedIndex];
          if (opt) { id = opt.value; price = Number(opt.dataset.price) || price; name = `${name} — ${opt.text.split(" — ")[0]}`; }
        }
      }
      const qtySelector = add.dataset.qtyInput;
      let qty = 1;
      if (qtySelector) {
        const input = qtySelector === "1" ? add.closest("form")?.querySelector('input[name="qty"]') : document.querySelector(qtySelector);
        qty = Math.max(1, Number(input?.value) || 1);
      }
      addLine({ id, name, price, qty, image: add.dataset.image || "", max: 99 });
      renderCart();
      openCart();
      return;
    }

    const line = e.target.closest("[data-line]");
    if (line) {
      const id = line.dataset.line;
      const lines = readCart();
      const item = lines.find((l) => l.id === id);
      if (!item) return;
      if (e.target.closest("[data-cart-inc]")) item.qty += 1;
      else if (e.target.closest("[data-cart-dec]")) item.qty -= 1;
      else if (e.target.closest("[data-cart-remove]")) item.qty = 0;
      else return;
      writeCart(lines.filter((l) => l.qty > 0));
    }
  });

  document.addEventListener("change", (e) => {
    const input = e.target.closest("[data-cart-qty]");
    if (!input) return;
    const id = input.closest("[data-line]")?.dataset.line;
    const lines = readCart();
    const item = lines.find((l) => l.id === id);
    if (!item) return;
    item.qty = Math.max(0, Math.min(item.max || 99, Number(input.value) || 0));
    writeCart(lines.filter((l) => l.qty > 0));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer?.classList.contains("is-open")) closeCart();
  });

  /* ------------------------------ quantity ------------------------------- */
  document.addEventListener("click", (e) => {
    const up = e.target.closest("[data-qty-up]");
    const down = e.target.closest("[data-qty-down]");
    if (!up && !down) return;
    const input = (up || down).closest(".qty")?.querySelector('input[name="qty"]');
    if (!input) return;
    const max = Number(input.max) || 99;
    input.value = Math.max(1, Math.min(max, (Number(input.value) || 1) + (up ? 1 : -1)));
  });

  /* ------------------------------- nav ----------------------------------- */
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("site-nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
  }

  /* ----------------------------- checkout -------------------------------- */
  const checkoutForm = document.querySelector("[data-checkout-form]");
  if (checkoutForm) initCheckout(checkoutForm);

  function initCheckout(form) {
    // The order summary and totals live in the page sidebar, outside the form.
    const itemsField = form.querySelector("[data-cart-field]");
    const summary = document.querySelector("[data-cart-summary]");
    const totals = document.querySelector("[data-cart-totals]");
    const errorBox = form.querySelector("[data-checkout-error]");
    const submit = form.querySelector("[data-checkout-submit]");
    const empty = document.querySelector("[data-cart-empty]");
    const deliveryFields = form.querySelector("[data-delivery-fields]");
    const pickupNote = form.querySelector("[data-pickup-note]");
    let code = "";
    let quoteData = null;

    const showError = (msg) => {
      if (!errorBox) return;
      errorBox.hidden = !msg;
      errorBox.innerHTML = msg ? `<span>${esc(msg)}</span>` : "";
    };
    const syncItems = () => {
      const lines = readCart().map((l) => ({ id: l.id, qty: l.qty }));
      if (itemsField) itemsField.value = JSON.stringify(lines);
      return lines;
    };
    const fulfilment = () => form.querySelector('input[name="fulfilment"]:checked')?.value || "pickup";

    async function refresh() {
      const lines = syncItems();
      if (!lines.length) {
        if (empty) empty.hidden = false;
        if (submit) submit.disabled = true;
        if (summary) summary.innerHTML = `<p class="muted">Nothing in the cart yet.</p>`;
        if (totals) totals.innerHTML = "";
        return;
      }
      if (empty) empty.hidden = true;
      if (submit) submit.disabled = false;
      if (summary) {
        summary.innerHTML = readCart().map((l) => `<div class="cart-line"><div class="cart-line-main"><strong>${esc(l.name)}</strong><small>${l.qty} × ${money(l.price)}</small></div><div class="cart-line-right">${money(l.price * l.qty)}</div></div>`).join("");
      }
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
          body: JSON.stringify({ items: lines, fulfilment: fulfilment(), code, tip_cents: 0 })
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error || "Could not price the cart."); if (totals) totals.innerHTML = ""; return; }
        quoteData = data;
        showError("");
        // The server decides money, so the summary lines follow the quote, not
        // the local cart (prices may have changed since the item was added).
        if (summary) {
          summary.innerHTML = data.lines.map((l) => `<div class="cart-line"><div class="cart-line-main"><strong>${esc(l.name)}</strong><small>${l.qty} × ${money(l.unit_price_cents)}</small></div><div class="cart-line-right">${money(l.line_total_cents)}</div></div>`).join("");
        }
        if (totals) {
          totals.innerHTML = `
            <p><span>Subtotal</span><span>${money(data.subtotal_cents)}</span></p>
            ${data.discount_cents ? `<p><span>Discount ${esc(data.discount_code)}</span><span>−${money(data.discount_cents)}</span></p>` : ""}
            ${data.delivery_cents ? `<p><span>Delivery</span><span>${money(data.delivery_cents)}</span></p>` : ""}
            ${data.tax_cents ? `<p><span>Tax</span><span>${money(data.tax_cents)}</span></p>` : ""}
            <p class="total-row"><span>Total</span><span>${money(data.total_cents)}</span></p>`;
        }
      } catch {
        showError("Could not reach the server. Check your connection.");
      }
    }

    form.querySelectorAll('input[name="fulfilment"]').forEach((input) => {
      input.addEventListener("change", () => {
        const delivery = fulfilment() === "delivery";
        if (deliveryFields) deliveryFields.hidden = !delivery;
        if (pickupNote) pickupNote.hidden = delivery;
        refresh();
      });
    });

    const applyBtn = form.querySelector("[data-apply-code]");
    if (applyBtn) {
      applyBtn.addEventListener("click", async () => {
        const input = form.querySelector('input[name="code"]');
        const msg = form.querySelector("[data-code-msg]");
        const value = (input?.value || "").trim();
        if (!value) { if (msg) msg.textContent = "Enter a code."; return; }
        const res = await fetch(`/api/discount?code=${encodeURIComponent(value)}&subtotal=${subtotal(readCart())}`);
        const data = await res.json();
        if (data.ok) {
          code = data.code;
          if (msg) msg.textContent = `Code applied — ${money(data.amountCents)} off.`;
          refresh();
        } else {
          code = "";
          if (msg) msg.textContent = data.error || "That code does not apply.";
          refresh();
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const lines = syncItems();
      if (!lines.length) return showError("Your cart is empty.");
      if (!form.reportValidity()) return;
      submit.disabled = true;
      const original = submit.textContent;
      submit.textContent = "Placing order…";
      const payload = {
        items: lines,
        name: form.querySelector('input[name="name"]')?.value || "",
        email: form.querySelector('input[name="email"]')?.value || "",
        phone: form.querySelector('input[name="phone"]')?.value || "",
        fulfilment: fulfilment(),
        address: form.querySelector('input[name="address"]')?.value || "",
        notes: form.querySelector('textarea[name="notes"]')?.value || "",
        payment_method: form.querySelector('input[name="payment_method"]:checked')?.value || "offline",
        code,
        use_points: !!form.querySelector('input[name="use_points"]')?.checked
      };
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Checkout failed.");
        if (data.helcim) {
          // Helcim: the order exists and is unpaid. Open the HelcimPay.js modal;
          // the SUCCESS message goes to our confirm endpoint, which verifies
          // the transaction server-side before showing the order as paid.
          localStorage.removeItem(CART_KEY);
          const orderToken = data.orderToken;
          submit.textContent = "Waiting for payment…";
          await helcimPay(data.helcim.checkoutToken, orderToken, showError, () => {
            submit.disabled = false;
            submit.textContent = original;
          });
          return;
        }
        localStorage.removeItem(CART_KEY);
        window.location.href = data.url;
      } catch (err) {
        showError(err.message);
        submit.disabled = false;
        submit.textContent = original;
      }
    });

    // HelcimPay.js: load their script, render the modal iframe and relay the
    // payment result to the server for verification.
    let helcimScriptLoading = null;
    function helcimScript() {
      if (window.appendHelcimPayIframe) return Promise.resolve();
      if (!helcimScriptLoading) {
        helcimScriptLoading = new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://secure.helcim.app/helcim-pay/services/start.js";
          s.onload = resolve;
          s.onerror = () => { helcimScriptLoading = null; reject(new Error("Could not load the payment window. Check your connection and try again.")); };
          document.head.appendChild(s);
        });
      }
      return helcimScriptLoading;
    }

    async function helcimPay(checkoutToken, orderToken, showError, reset) {
      try {
        await helcimScript();
      } catch (err) { showError(err.message); reset(); return; }

      const cleanup = () => { try { if (window.removeHelcimPayIframe) window.removeHelcimPayIframe(); } catch { /* already gone */ } };
      let settled = false;

      await new Promise((resolve) => {
        const handler = async (event) => {
          // Only accept messages from Helcim's checkout origin.
          if (!/^https:\/\/([a-z0-9-]+\.)*helcim\.app$/.test(String(event.origin))) return;
          if (!event.data || event.data.eventName !== "helcim-pay-js-" + checkoutToken) return;
          if (settled) return;

          if (event.data.eventStatus === "HIDE") {
            // Modal or confirmation screen closed: no more messages will come.
            settled = true;
            window.removeEventListener("message", handler);
            cleanup();
            resolve();
            return;
          }
          if (event.data.eventStatus === "ABORTED") {
            settled = true;
            window.removeEventListener("message", handler);
            cleanup();
            const message = typeof event.data.eventMessage === "string"
              ? event.data.eventMessage.replace(/^HelcimPay\.js transaction failed - ?/, "")
              : "The payment was declined or cancelled.";
            showError(message);
            reset();
            resolve();
            return;
          }
          if (event.data.eventStatus === "SUCCESS") {
            settled = true;
            window.removeEventListener("message", handler);
            cleanup();
            try {
              const res = await fetch("/api/helcim/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
                body: JSON.stringify({ orderToken, response: event.data.eventMessage })
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "We could not verify this payment.");
              window.location.href = data.url;
            } catch (err) {
              showError(err.message);
              reset();
            }
            resolve();
          }
        };
        window.addEventListener("message", handler);
        window.appendHelcimPayIframe(checkoutToken);
      });
    }

    document.addEventListener("cart:change", refresh);
    const deliveryRadio = form.querySelector('input[name="fulfilment"][value="delivery"]');
    if (deliveryRadio?.checked && deliveryFields) deliveryFields.hidden = false;
    refresh();
  }

  renderCart();
})();
