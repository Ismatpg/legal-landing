/* assets/js/login.js
   Login del panel de administración
   - Envia credenciales al Worker
   - Incluye token de Turnstile
   - Guarda cookie HttpOnly (credentials: 'include')
   - Redirige a /legal-landing/admin/admin.html si todo va bien
*/

// === URL base de tu Worker API ===
const CF_API_BASE = "https://lead-api.ismael-guijarro-raissouni.workers.dev";

// === Prefijo de GitHub Pages (ajusta si cambias el nombre del repo) ===
const PAGES_BASE = "/legal-landing";
const ADMIN_BASE = `${PAGES_BASE}/admin`;

const $ = (s) => document.querySelector(s);

function setStatus(msg = "", ok = false) {
  const el = $("#login-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "#0f5132" : "#b00020";
}

function setBusy(isBusy) {
  const btn = $("#btn-login");
  if (!btn) return;
  btn.disabled = isBusy;
  if (isBusy) {
    btn.setAttribute("aria-busy", "true");
  } else {
    btn.removeAttribute("aria-busy");
  }
}

async function doLogin() {
  setStatus("");
  setBusy(true);

  const username = $("#username")?.value.trim();
  const password = $("#password")?.value;

  if (!username || !password) {
    setStatus("Usuario y contraseña son obligatorios.");
    setBusy(false);
    return;
  }

  // Token de Turnstile (input oculto que el widget añade automáticamente)
  const cfTokenInput = document.querySelector('input[name="cf-turnstile-response"]');
  const cfToken = cfTokenInput ? cfTokenInput.value : "";

  if (!cfToken) {
    setStatus("Resuelve el captcha para continuar.");
    setBusy(false);
    return;
  }

  if (!CF_API_BASE) {
    setStatus("CF_API_BASE no está configurado en login.js.");
    setBusy(false);
    return;
  }

  try {
    const res = await fetch(`${CF_API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // importante para recibir la cookie HttpOnly
      body: JSON.stringify({ username, password, cfToken })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (data?.error === "TURNSTILE_FAILED") {
        setStatus("Verificación anti‑bots fallida. Recarga la página y vuelve a intentarlo.");
      } else if (data?.error === "BAD_CREDENTIALS") {
        setStatus("Credenciales incorrectas.");
      } else {
        setStatus("No se pudo iniciar sesión.");
      }
      // Resetea el widget para generar un nuevo token
      try { if (window.turnstile) window.turnstile.reset(); } catch {}
      setBusy(false);
      return;
    }

    setStatus("Acceso correcto. Redirigiendo…", true);
    // Redirige al panel
    location.href = `${ADMIN_BASE}/admin.html`;
  } catch (err) {
    setStatus("Error de red. Revisa la URL del API (CF_API_BASE).");
    setBusy(false);
  }
}

function init() {
  const btn = $("#btn-login");
  if (btn) btn.addEventListener("click", doLogin);

  // Evita navegación si el script no carga; aquí sí hacemos preventDefault
  const form = $("#login-form");
  if (form) {
    form.addEventListener("submit", (e) => { e.preventDefault(); doLogin(); });
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doLogin(); }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
