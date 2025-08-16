"use strict";

/**
 * Version FR/MA (Maroc)
 * - Textes et validations en français
 * - Envoi vers l'API externe (API_URL)
 */
const API_URL = "https://TU_API.example.com/api/leads"; // ← remplacez par votre Worker/API

(function () {
  const form = document.getElementById("lead-form");
  const phone = document.getElementById("phone");
  const city = document.getElementById("city");
  const summary = document.getElementById("summary");
  const consent = document.getElementById("consent");
  const hp = document.getElementById("middle-name");
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn");

  // Année
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // UTM/GCLID
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

  // Validations
  if (phone) {
    phone.addEventListener("blur", () => {
      const digits = onlyDigits(phone.value);
      if (digits.length < 8 || digits.length > 15) {
        setError("phone-error", "Entrez un téléphone valide (8–15 chiffres).");
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
        setError("summary-error", `Ajoutez un peu plus de détail (${summary.value.length}/20).`);
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

      // Honeypot
      if (hp && hp.value) return;

      // Validation minimale
      let hasError = false;
      const digits = onlyDigits(phone.value);
      if (!digits || digits.length < 8 || digits.length > 15) {
        setError("phone-error", "Entrez un téléphone valide (8–15 chiffres).");
        phone.setAttribute("aria-invalid", "true");
        hasError = true;
      }
      if (!city.value) {
        setError("city-error", "Sélectionnez votre ville.");
        city.setAttribute("aria-invalid", "true");
        hasError = true;
      }
      if (!summary.value || summary.value.length < 20) {
        setError("summary-error", "Décrivez votre situation en au moins 20 caractères.");
        summary.setAttribute("aria-invalid", "true");
        hasError = true;
      }
      if (!consent.checked) {
        statusEl.hidden = false;
        statusEl.textContent = "Vous devez accepter la politique de confidentialité.";
        return;
      }
      if (hasError) return;

      // Token Turnstile (Cloudflare ajoute un input caché)
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
      statusEl.textContent = "Envoi en cours…";

      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const code = data && (data.error || data.error_code);
          let msg = "Un problème est survenu lors de l’envoi. Réessayez.";
          if (code === "PHONE_INVALID") msg = "Téléphone invalide (8–15 chiffres).";
          else if (code === "CITY_REQUIRED") msg = "Sélectionnez votre ville.";
          else if (code === "SUMMARY_SHORT") msg = "Résumé trop court (min. 20 caractères).";
          else if (code === "CONSENT_REQUIRED") msg = "Vous devez accepter la politique de confidentialité.";
          else if (code === "TURNSTILE_FAILED") msg = "La vérification anti‑bots a échoué. Rechargez la page.";
          statusEl.textContent = msg;
          return;
        }

        statusEl.textContent = "Merci ! Nous vous recontacterons très vite.";
        form.reset();
      } catch (err) {
        statusEl.textContent = "Un problème est survenu lors de l’envoi. Réessayez.";
      } finally {
        disableForm(false);
      }
    });
  }
})();
