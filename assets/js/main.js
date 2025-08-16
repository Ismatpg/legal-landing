"use strict";

/**
 * FR/MA:
 * - Stepper (3 étapes) avec validation à chaque étape
 * - Résumé des erreurs accessible
 * - Compteur de caractères (Résumé)
 * - Envoi à API (CORS) + Turnstile
 * - Parallax fallback si pas de scroll‑timeline
 */
const API_URL = "https://lead-api.ismael-guijarro-raissouni.workers.dev"; // ← tu Worker/API

(function () {
  const form = document.getElementById("lead-form");

  // Campos
  const phone = document.getElementById("phone");
  const city = document.getElementById("city");
  const summary = document.getElementById("summary");
  const consent = document.getElementById("consent");
  const hp = document.getElementById("middle-name");

  // UI
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn");
  const countEl = document.getElementById("summary-count");
  const errorSummary = document.getElementById("error-summary");
  const errorList = document.getElementById("error-list");

  // Stepper UI
  const steps = Array.from(document.querySelectorAll(".stepper .step"));
  const next1 = document.getElementById("next-1");
  const next2 = document.getElementById("next-2");
  const back2 = document.getElementById("back-2");
  const back3 = document.getElementById("back-3");
  let activeIndex = 0;

  // Año
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
    if (errorSummary) {
      errorSummary.hidden = true;
      if (errorList) errorList.innerHTML = "";
    }
  };
  const disableForm = (disabled) => {
    if (submitBtn) {
      submitBtn.disabled = disabled;
      submitBtn.setAttribute("aria-busy", String(disabled));
    }
  };
  const addErrorToSummary = (fieldId, message) => {
    if (!errorSummary || !errorList) return;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${fieldId}`;
    a.textContent = message;
    li.appendChild(a);
    errorList.appendChild(li);
    errorSummary.hidden = false;
  };

  // Stepper helpers
  function showStep(i) {
    steps.forEach((s, idx) => {
      s.classList.toggle("is-active", idx === i);
      s.classList.toggle("is-complete", idx < i);
      s.setAttribute("aria-expanded", idx === i ? "true" : "false");
    });
    activeIndex = i;
    const focusable = steps[i].querySelector("input, select, textarea, button");
    if (focusable) focusable.focus({ preventScroll: true });
    steps[i].scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function validateStep1() {
    const digits = onlyDigits(phone.value);
    if (!digits || digits.length < 8 || digits.length > 15) {
      const msg = "Téléphone invalide (8–15 chiffres).";
      setError("phone-error", msg);
      phone.setAttribute("aria-invalid", "true");
      return false;
    }
    setError("phone-error", "");
    phone.removeAttribute("aria-invalid");
    return true;
  }

  function validateStep2() {
    if (!city.value) {
      const msg = "Sélectionnez votre ville.";
      setError("city-error", msg);
      city.setAttribute("aria-invalid", "true");
      return false;
    }
    setError("city-error", "");
    city.removeAttribute("aria-invalid");
    return true;
  }

  // Contador inicial
  if (countEl && summary) countEl.textContent = `${summary.value.length}/1000`;
  if (summary) {
    const updateCount = () => { if (countEl) countEl.textContent = `${summary.value.length}/1000`; };
    summary.addEventListener("input", () => {
      updateCount();
      if (summary.value && summary.value.length < 20) {
        setError("summary-error", `Ajoutez un peu plus de détail (${summary.value.length}/20).`);
        summary.setAttribute("aria-invalid", "true");
      } else {
        setError("summary-error", "");
        summary.removeAttribute("aria-invalid");
      }
    });
    updateCount();
  }

  // Eventos Stepper
  if (next1) next1.addEventListener("click", () => {
    clearErrors();
    if (!validateStep1()) {
      addErrorToSummary("phone", "Téléphone invalide (8–15 chiffres).");
      errorSummary.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    showStep(1); // Étape 2
  });

  if (next2) next2.addEventListener("click", () => {
    clearErrors();
    if (!validateStep2()) {
      addErrorToSummary("city", "Sélectionnez votre ville.");
      errorSummary.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    showStep(2); // Étape 3
  });

  if (back2) back2.addEventListener("click", () => showStep(0));
  if (back3) back3.addEventListener("click", () => showStep(1));

  // Enter → siguiente paso en 1 y 2
  if (phone) phone.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); next1?.click(); }
  });
  if (city) city.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); next2?.click(); }
  });

  // Envío final
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors();

      // Honeypot
      if (hp && hp.value) return;

      // Validación completa
      let hasError = false;

      if (!validateStep1()) {
        addErrorToSummary("phone", "Téléphone invalide (8–15 chiffres).");
        showStep(0);
        hasError = true;
      }
      if (!validateStep2()) {
        addErrorToSummary("city", "Sélectionnez votre ville.");
        if (!hasError) showStep(1);
        hasError = true;
      }
      if (!summary.value || summary.value.length < 20) {
        const msg = "Décrivez votre situation en au moins 20 caractères.";
        setError("summary-error", msg);
        summary.setAttribute("aria-invalid", "true");
        addErrorToSummary("summary", msg);
        if (!hasError) showStep(2);
        hasError = true;
      }
      if (!consent.checked) {
        showStep(2);
        statusEl.hidden = false;
        statusEl.textContent = "Vous devez accepter la politique de confidentialité.";
        return;
      }

      if (hasError) {
        errorSummary.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      // Token Turnstile
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
        showStep(0); // vuelve al inicio
        if (countEl) countEl.textContent = "0/1000";
      } catch (err) {
        statusEl.textContent = "Un problème est survenu lors de l’envoi. Réessayez.";
      } finally {
        disableForm(false);
      }
    });
  }

  // Parallax fallback (si no hay scroll‑timeline y no se ha pedido reducir movimiento)
  (function(){
    const media = document.querySelector('.hero-media.parallax');
    if (!media) return;
    const supports = CSS && CSS.supports && CSS.supports('animation-timeline: view()');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (supports || reduce) return;

    let raf, lastY = -1;
    const speed = 0.08;

    const onScroll = () => {
      const rect = media.parentElement.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      if (rect.bottom < 0 || rect.top > vh){
        if (raf) cancelAnimationFrame(raf);
        return;
      }
      const y = window.scrollY || window.pageYOffset;
      if (y === lastY) { raf = requestAnimationFrame(onScroll); return; }
      lastY = y;
      const offset = (y * speed);
      media.style.transform = `translate3d(0, ${-4 + (offset % 8)}%, 0)`;
      raf = requestAnimationFrame(onScroll);
    };

    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
    onScroll();
  })();
})();
