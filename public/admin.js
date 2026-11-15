// Back-office behaviour: sidebar, confirmations, media upload, theme preview.

(() => {
  const csrf = () => (document.cookie.match(/(?:^|;\s*)shop_csrf=([^;]+)/) || [])[1] || "";

  /* ------------------------------- sidebar ------------------------------- */
  const sidebar = document.getElementById("admin-sidebar");
  document.querySelector("[data-admin-nav]")?.addEventListener("click", () => {
    sidebar?.classList.toggle("is-open");
  });
  document.addEventListener("click", (e) => {
    if (!sidebar?.classList.contains("is-open")) return;
    if (sidebar.contains(e.target) || e.target.closest("[data-admin-nav]")) return;
    sidebar.classList.remove("is-open");
  });

  /* ------------------------------ confirm -------------------------------- */
  document.addEventListener("submit", (e) => {
    const form = e.target;
    const message = form.dataset?.confirm;
    if (message && !window.confirm(message)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  /* --------------------------- upload inline ----------------------------- */
  document.addEventListener("change", async (e) => {
    const input = e.target.closest("[data-upload-for]");
    if (!input || !input.files?.[0]) return;
    const fieldName = input.dataset.uploadFor;
    const form = input.closest("form");
    const target = form?.querySelector(`[name="${fieldName}"]`);
    const preview = form?.querySelector(`[data-preview-for="${fieldName}"], [data-media-preview="${fieldName}"]`);
    const fd = new FormData();
    fd.append("file", input.files[0]);
    input.disabled = true;
    try {
      const res = await fetch("/admin/media/upload", { method: "POST", headers: { "X-CSRF-Token": csrf() }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      if (target) target.value = data.filename;
      if (preview) {
        preview.innerHTML = `<img src="${data.url}" alt="">`;
        preview.style.display = "grid";
      }
    } catch (err) {
      alert(err.message);
    } finally {
      input.disabled = false;
      input.value = "";
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-auto-submit]") && e.target.form) e.target.form.submit();
  });

  /* ------------------------------ row links ------------------------------ */
  document.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-href]");
    if (!row || e.target.closest("a,button,form,input,select")) return;
    window.location.href = row.dataset.href;
  });

  /* ---------------------------- colour sync ------------------------------ */
  document.querySelectorAll("[data-sync-color]").forEach((text) => {
    const picker = document.getElementById(text.dataset.syncColor);
    if (!picker) return;
    picker.addEventListener("input", () => { text.value = picker.value; updatePreview(); });
    text.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) { picker.value = text.value; updatePreview(); }
    });
  });

  /* ------------------------------ theme ---------------------------------- */
  const themeForm = document.querySelector("[data-theme-form]");
  const preview = document.querySelector("[data-theme-preview]");

  const PREVIEW_VARS = {
    primary: "--p", primaryText: "--pt", accent: "--a", background: "--bg",
    surface: "--sf", text: "--tx", muted: "--mu", border: "--bd"
  };

  function updatePreview() {
    if (!themeForm || !preview) return;
    for (const [name, cssVar] of Object.entries(PREVIEW_VARS)) {
      const text = themeForm.querySelector(`[name="${name}_hex"]`);
      const picker = themeForm.querySelector(`input[type="color"][name="${name}"]`);
      const value = text?.value || picker?.value;
      if (value && /^#[0-9a-f]{6}$/i.test(value)) preview.style.setProperty(cssVar, value);
    }
  }

  if (themeForm) {
    themeForm.addEventListener("input", updatePreview);
    document.querySelectorAll("[data-theme-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [primary, accent, background] = String(btn.dataset.colors || "").split(",");
        const set = (name, value) => {
          const picker = themeForm.querySelector(`input[type="color"][name="${name}"]`);
          const text = themeForm.querySelector(`[name="${name}_hex"]`);
          if (picker && value) picker.value = value;
          if (text && value) text.value = value;
        };
        set("primary", primary);
        set("accent", accent);
        set("background", background);
        const preset = themeForm.querySelector("[data-theme-preset-input]");
        if (preset) preset.value = btn.dataset.themePreset;
        document.querySelectorAll("[data-theme-preset]").forEach((b) => b.classList.toggle("is-active", b === btn));
        updatePreview();
      });
    });
  }
})();
