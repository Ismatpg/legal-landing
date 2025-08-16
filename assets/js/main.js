"use strict";

/**
 * Versión para GitHub Pages:
 * - Rutas relativas para assets.
 * - Envío del formulario a una API externa (CORS) vía fetch.
 *   Cambia API_URL por la URL real de tu backend (Render/Fly/Railway/…).
 */

const API_URL = "https://TU_API.example.com/api/leads";

(function () {
  const form = document.getElementById("lead-form");
  const phone = document.getElementById("phone");
  const city = document.getElementById("city");
  const summary = document.getElementById("summary");
  const consent = document.getElementById("consent");
  const hp = document.getElementById("middle-name");
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn");

  // Año dinámico en footer
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Captura UTM/GCLID
  const params = new URLSearchParams(location.search);
  ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid"].forEach(k => {
    const el = document.getElementById(k);
    if (el && params.get(k)) el.value = params.get(k);
  });

  // Helpers
  const onlyDigits = (s) => (s || "").replace(/\D+/g, "");
  const setError = (id, msg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || "";
  };
  const clearErrors = () => {
    ["phone-error","city-error","summary-error"].forEach(id => setError(id, ""));
    [phone, city, summary].forEach(i => i && i.removeAttribute("aria-invalid"));
  };
  const disableForm = (disabled) => {
    submitBtn.disabled = disabled;
    submitBtn.setAttribute("aria-busy", String(disabled));
  };

  // Validaciones on-blur / on-input
  if (phone) {
    phone.addEventListener("blur", () => {
      const digits = onlyDigits(phone.value);
      if (digits.length < 8 || digits.length > 15) {
        setError("phone-error", "Introduce un teléfono válido (8–15 dígitos).");
        phone.setAttribute("aria-invalid", "true");
      } else {
        setError("phone-error", "");
        phone.removeAttribute("aria-invalid");
      }
    });
  }

  if (summary) {
    summary.addEventListener("input", () => {
      if (summary.value && summary.value.length < 20) {
        setError("summary-error", `Añade un poco más de detalle (${summary.value.length}/20).`);
        summary.setAttribute("aria-invalid", "true");
      } else {
        setError("summary-error", "");
        summary.removeAttribute("aria-invalid");
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors();

      // Honeypot (antispam)
      if (hp && hp.value) return;

      // Validación mínima
      let hasError = false;
      const digits = onlyDigits(phone.value);
      if (!digits || digits.length < 8 || digits.length > 15) {
        setError("phone-error", "Introduce un teléfono válido (8–15 dígitos).");
        phone.setAttribute("aria-invalid", "true");
        hasError = true;
      }
      if (!city.value) {
        setError("city-error", "Selecciona tu ciudad.");
        city.setAttribute("aria-invalid", "true");
        hasError = true;
      }
      if (!summary.value || summary.value.length < 20) {
        setError("summary-error", "Cuéntanos al menos 20 caracteres.");
        summary.setAttribute("aria-invalid", "true");
        hasError = true;
      }
      if (!consent.checked) {
        statusEl.hidden = false;
        statusEl.textContent = "Debes aceptar el aviso de privacidad.";
        return;
      }
      if (hasError) return;

      // Token Turnstile (Cloudflare inserta un input oculto con el response)
      const cfTokenInput = form.querySelector('input[name="cf-turnstile-response"]');
      const cfToken = cfTokenInput ? cfTokenInput.value : "";

      // Payload
      const payload = {
        phone: phone.value.trim(),
        city: city.value,
        summary: summary.value.trim(),
        consent: true,
        utm_source: document.getElementById("utm_source").value || "",
        utm_medium: document.getElementById("utm_medium").value || "",
        utm_campaign: document.getElementById("utm_campaign").value || "",
        utm_term: document.getElementById("utm_term").value || "",
        utm_content: document.getElementById("utm_content").value || "",
        gclid: document.getElementById("gclid").value || "",
        turnstileToken: cfToken
      };

      disableForm(true);
      statusEl.hidden = false;
      statusEl.textContent = "Enviando…";

      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const code = data && (data.error || data.error_code);
          let msg = "Ha ocurrido un problema al enviar. Intenta de nuevo.";
          if (code === "PHONE_INVALID") msg = "Teléfono inválido. Revisa el número (8–15 dígitos).";
          else if (code === "CITY_REQUIRED") msg = "Selecciona tu ciudad.";
          else if (code === "SUMMARY_SHORT") msg = "El resumen es demasiado corto (mín. 20 caracteres).";
          else if (code === "CONSENT_REQUIRED") msg = "Debes aceptar el aviso de privacidad.";
          else if (code === "TURNSTILE_FAILED") msg = "No pudimos verificar que eres humano. Recarga la página.";
          statusEl.textContent = msg;
          return;
        }

        statusEl.textContent = "¡Gracias! Te contactaremos en breve.";
        form.reset();
      } catch (err) {
        statusEl.textContent = "Ha ocurrido un problema al enviar. Intenta de nuevo.";
      } finally {
        disableForm(false);
      }
    });
  }
})();
