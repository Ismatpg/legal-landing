export default {
    async fetch(request, env) {
      const url = new URL(request.url);
  
      // === CORS ===
      const origin = request.headers.get("Origin") || "";
      const allowed = (env.ALLOWED_ORIGINS || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      const allowAny = allowed.includes("*");
      const allowOrigin = allowAny ? origin : (allowed.includes(origin) ? origin : "");
      const corsBase = {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      };
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsBase });
      }
  
      // === Endpoint principal ===
      if (url.pathname === "/api/leads" && request.method === "POST") {
        // Acepta JSON o x-www-form-urlencoded
        const ctype = request.headers.get("content-type") || "";
        let body = {};
        try {
          if (ctype.includes("application/json")) {
            body = await request.json();
          } else if (ctype.includes("application/x-www-form-urlencoded")) {
            const form = await request.formData();
            body = Object.fromEntries(form.entries());
          }
        } catch {
          return json({ ok: false, error: "BAD_BODY" }, 400);
        }
  
        const phone = body.phone || "";
        const city = body.city || "";
        const summary = body.summary || "";
        const consent = body.consent === true || body.consent === "true" || body.consent === "on";
        const turnstileToken = body.turnstileToken || body["cf-turnstile-response"] || "";
  
        // Validaciones
        const digits = String(phone).replace(/\D+/g, "");
        if (!digits || digits.length < 8 || digits.length > 15) return json({ ok: false, error: "PHONE_INVALID" }, 400);
        if (!city) return json({ ok: false, error: "CITY_REQUIRED" }, 400);
        if (!summary || String(summary).length < 20) return json({ ok: false, error: "SUMMARY_SHORT" }, 400);
        if (!consent) return json({ ok: false, error: "CONSENT_REQUIRED" }, 400);
  
        // Verificación de Turnstile (obligatoria en servidor)
        if (env.TURNSTILE_SECRET) {
          const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              secret: env.TURNSTILE_SECRET,
              response: String(turnstileToken || ""),
              remoteip: request.headers.get("CF-Connecting-IP") || ""
            })
          }).then(r => r.json());
  
          if (!verify.success) return json({ ok: false, error: "TURNSTILE_FAILED" }, 400);
        }
  
        // Guardado en KV (si está vinculado)
        const key = `lead:${Date.now()}:${crypto.randomUUID()}`;
        const record = {
          ts: new Date().toISOString(),
          ip: request.headers.get("CF-Connecting-IP") || "",
          phone: String(phone),
          city: String(city),
          summary: String(summary),
          consent: Boolean(consent),
          utm_source: String(body.utm_source || ""),
          utm_medium: String(body.utm_medium || ""),
          utm_campaign: String(body.utm_campaign || ""),
          utm_term: String(body.utm_term || ""),
          utm_content: String(body.utm_content || ""),
          gclid: String(body.gclid || "")
        };
  
        if (env.LEADS_KV) {
          await env.LEADS_KV.put(key, JSON.stringify(record));
        } else {
          // Si aún no has vinculado KV, al menos respondemos OK
          console.log("LEADS_KV no está vinculado; lead solo en logs:", record);
        }
  
        return json({ ok: true });
      }
  
      return new Response("Not found", { status: 404 });
  
      function json(obj, status = 200) {
        return new Response(JSON.stringify(obj), {
          status,
          headers: { "content-type": "application/json", ...corsBase }
        });
      }
    }
  };
  