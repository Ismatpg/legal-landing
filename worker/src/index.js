// Cloudflare Worker API para leads + login + reglas de ruteo (D1) + emails

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // CORS preflight
    if (request.method === 'OPTIONS') return handleOptions(request, env);

    try {
      // Rutas públicas
      if (url.pathname === '/api/leads' && request.method === 'POST') {
        return await handleLeadSubmit(request, env);
      }
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        return withCORS(new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() }), request, env, true, clearSessionCookie());
      }

      // Rutas admin (requieren auth)
      if (url.pathname.startsWith('/api/admin/')) {
        const user = await requireAuth(request, env);
        if (!user) return withCORS(jsonError(401, 'UNAUTHORIZED'), request, env, true);
        if (url.pathname === '/api/admin/routes' && request.method === 'GET') {
          return withCORS(await listRoutes(env), request, env, true);
        }
        if (url.pathname === '/api/admin/routes' && request.method === 'POST') {
          return withCORS(await upsertRoutes(request, env), request, env, true);
        }
        if (url.pathname.startsWith('/api/admin/routes/') && request.method === 'DELETE') {
          const city = decodeURIComponent(url.pathname.replace('/api/admin/routes/', ''));
          return withCORS(await deleteRoute(env, city), request, env, true);
        }
        if (url.pathname === '/api/admin/users' && request.method === 'GET') {
          return withCORS(await listUsers(env), request, env, true);
        }
        if (url.pathname === '/api/admin/users' && request.method === 'POST') {
          return withCORS(await createUser(request, env), request, env, true);
        }
        if (url.pathname.startsWith('/api/admin/users/') && request.method === 'DELETE') {
          const uname = decodeURIComponent(url.pathname.replace('/api/admin/users/', ''));
          return withCORS(await deleteUser(env, uname), request, env, true);
        }
        if (url.pathname === '/api/admin/settings' && request.method === 'GET') {
          return withCORS(await getSettings(env), request, env, true);
        }
        if (url.pathname === '/api/admin/settings' && request.method === 'POST') {
          return withCORS(await setSettings(request, env), request, env, true);
        }
        if (url.pathname === '/api/admin/leads' && request.method === 'GET') {
          return withCORS(await listLeads(request, env), request, env, true);
        }
        return withCORS(jsonError(404, 'NOT_FOUND'), request, env, true);
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('ERROR', err);
      return withCORS(jsonError(500, 'INTERNAL_ERROR'), request, env, true);
    }
  }
};

/* ============ Helpers generales ============ */

function jsonHeaders() {
  return { 'Content-Type': 'application/json; charset=utf-8' };
}
function jsonError(status, code, extra = {}) {
  return new Response(JSON.stringify({ error: code, ...extra }), { status, headers: jsonHeaders() });
}
function parseAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
function withCORS(resp, request, env, allowCredentials = false, extraCookie = '') {
  const origin = request.headers.get('Origin');
  const allowed = parseAllowedOrigins(env);
  const headers = new Headers(resp.headers);
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    if (allowCredentials) headers.set('Access-Control-Allow-Credentials', 'true');
  }
  if (extraCookie) headers.append('Set-Cookie', extraCookie);
  return new Response(resp.body, { status: resp.status, headers });
}
function handleOptions(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = parseAllowedOrigins(env);
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400'
  });
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return new Response(null, { status: 204, headers });
}

/* ============ Turnstile ============ */
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return { success: true }; // si no está configurado, no bloquea
  if (!token) return { success: false };
  const form = new URLSearchParams();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  return res.ok ? res.json() : { success: false };
}

/* ============ JWT HS256 mínimo (sin dependencias) ============ */
const text = s => new TextEncoder().encode(s);
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function hmacSHA256(key, msg) {
  const k = await crypto.subtle.importKey('raw', text(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return crypto.subtle.sign('HMAC', k, text(msg));
}
async function signJWT(payload, secret, expSeconds = 12 * 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expSeconds, ...payload };
  const head = b64u(text(JSON.stringify(header)));
  const bod = b64u(text(JSON.stringify(body)));
  const sig = b64u(await hmacSHA256(secret, `${head}.${bod}`));
  return `${head}.${bod}.${sig}`;
}
async function verifyJWT(token, secret) {
  const [head, bod, sig] = token.split('.');
  if (!head || !bod || !sig) return null;
  const expSig = b64u(await hmacSHA256(secret, `${head}.${bod}`));
  if (expSig !== sig) return null;
  const payload = JSON.parse(atob(bod.replace(/-/g, '+').replace(/_/g, '/')));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function hashPassword(password) {
  const hash = await crypto.subtle.digest('SHA-256', text(password));
  return b64u(hash);
}

async function verifyPassword(password, hashed) {
  return (await hashPassword(password)) === hashed;
}
function setSessionCookie(token) {
  // Cookie cross-site para que GitHub Pages pueda enviarla en fetch(credentials: 'include')
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${12 * 60 * 60}`;
}
function clearSessionCookie() {
  return `session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}
async function requireAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return null;
  try { return await verifyJWT(decodeURIComponent(m[1]), env.JWT_SECRET); }
  catch { return null; }
}

/* ============ BBDD utilidades ============ */
async function ensureSchema(env) {
  // Por si no aplicaste migraciones, garantizamos mínimas tablas
  await env.DB.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      summary TEXT NOT NULL,
      utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
      gclid TEXT
    );
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL
    );
    INSERT OR IGNORE INTO settings (key, value) VALUES ('default_email', COALESCE(?,'leads@example.com'));
  `, [env.DEFAULT_EMAIL || null]);
}
async function getDefaultEmail(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key='default_email'`).first();
  return (row?.value || env.DEFAULT_EMAIL || env.ADMIN_USER || 'leads@example.com');
}
async function getEmailsForCity(env, city) {
  const row = await env.DB.prepare(`SELECT email FROM routes WHERE lower(city)=lower(?)`).bind(city).first();
  const s = row?.email || '';
  const arr = s.split(/[;,]/).map(x => x.trim()).filter(Boolean);
  return arr.length ? arr : [await getDefaultEmail(env)];
}

/* ============ Emails ============ */
function parseEmails(input) {
  return (Array.isArray(input) ? input : String(input || ''))
    .split(/[;,]/)
    .map(s => s.trim())
    .filter(Boolean);
}
async function sendEmail(env, toList, subject, textBody, htmlBody) {
  const provider = (env.MAIL_PROVIDER || 'resend').toLowerCase();
  if (provider === 'resend') return sendEmailResend(env, toList, subject, textBody, htmlBody);
  return sendEmailMailchannels(env, toList, subject, textBody, htmlBody);
}
async function sendEmailResend(env, toList, subject, textBody, htmlBody) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'no-reply@example.com',
      to: toList,
      subject,
      text: textBody,
      html: htmlBody
    })
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
}
async function sendEmailMailchannels(env, toList, subject, textBody, htmlBody) {
  const body = {
    personalizations: [{ to: toList.map(email => ({ email })) }],
    from: { email: env.MAIL_FROM || 'no-reply@example.com', name: 'Landing' },
    subject,
    content: [
      { type: 'text/plain', value: textBody },
      { type: 'text/html', value: htmlBody }
    ]
  };
  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`MailChannels error: ${await res.text()}`);
}

/* ============ Handlers ============ */

async function handleLeadSubmit(request, env) {
  await ensureSchema(env);
  const ip = request.headers.get('CF-Connecting-IP');
  const data = await request.json().catch(() => ({}));
  const { phone, city, summary, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, turnstileToken } = data || {};

  // Turnstile
  const t = await verifyTurnstile(env, turnstileToken, ip);
  if (!t?.success) return withCORS(jsonError(400, 'TURNSTILE_FAILED'), request, env);

  // Validaciones básicas
  const digits = String(phone || '').replace(/\D+/g, '');
  if (digits.length < 8 || digits.length > 15) return withCORS(jsonError(400, 'PHONE_INVALID'), request, env);
  if (!city) return withCORS(jsonError(400, 'CITY_REQUIRED'), request, env);
  if (!summary || summary.length < 20) return withCORS(jsonError(400, 'SUMMARY_SHORT'), request, env);

  // Guardar lead
  await env.DB.prepare(
    `INSERT INTO leads (phone, city, summary, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(String(phone).trim(), city, summary.trim(), utm_source || null, utm_medium || null, utm_campaign || null, utm_term || null, utm_content || null, gclid || null).run();

  // Ruteo por ciudad → emails
  const recipients = await getEmailsForCity(env, city);

  // Enviar email
  const subj = `Nouveau lead (${city}) — ${digits}`;
  const text = [
    'Nouveau lead depuis la landing',
    `Téléphone: ${phone}`,
    `Ville: ${city}`,
    `Résumé: ${summary}`,
    '',
    `utm_source: ${utm_source || ''}`,
    `utm_medium: ${utm_medium || ''}`,
    `utm_campaign: ${utm_campaign || ''}`,
    `utm_term: ${utm_term || ''}`,
    `utm_content: ${utm_content || ''}`,
    `gclid: ${gclid || ''}`,
  ].join('\n');

  const html = `
    <h2>Nouveau lead</h2>
    <p><strong>Téléphone:</strong> ${escapeHtml(String(phone))}</p>
    <p><strong>Ville:</strong> ${escapeHtml(String(city))}</p>
    <p><strong>Résumé:</strong><br>${escapeHtml(String(summary)).replace(/\n/g,'<br>')}</p>
    <hr>
    <p><strong>UTM/GCLID</strong></p>
    <pre style="white-space:pre-wrap;font-family:ui-monospace,monospace">${escapeHtml(JSON.stringify({utm_source,utm_medium,utm_campaign,utm_term,utm_content,gclid}, null, 2))}</pre>
  `;

  try {
    await sendEmail(env, recipients, subj, text, html);
  } catch (e) {
    console.error('Email error:', e);
    // no bloqueamos al usuario; dejamos constancia del fallo de correo
  }

  return withCORS(new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() }), request, env);
}

async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP');
  const data = await request.json().catch(() => ({}));
  const { username, password, cfToken } = data || {};

  // Turnstile
  const t = await verifyTurnstile(env, cfToken, ip);
  if (!t?.success) return withCORS(jsonError(400, 'TURNSTILE_FAILED'), request, env, true);

  if (!username || !password) return withCORS(jsonError(400, 'BAD_CREDENTIALS'), request, env, true);

  let role = 'user';
  let ok = false;
  if (username === env.ADMIN_USER && password === env.ADMIN_PASS) {
    ok = true;
    role = 'admin';
  } else {
    await ensureSchema(env);
    const row = await env.DB.prepare(`SELECT pass_hash FROM users WHERE username=?`).bind(username).first();
    if (row && await verifyPassword(password, row.pass_hash)) ok = true;
  }

  if (!ok) return withCORS(jsonError(401, 'BAD_CREDENTIALS'), request, env, true);

  const token = await signJWT({ sub: username, role }, env.JWT_SECRET, 12 * 60 * 60);
  const resp = new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() });
  return withCORS(resp, request, env, true, setSessionCookie(token));
}

/* ---- Admin: reglas ---- */
async function listRoutes(env) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(`SELECT city, email FROM routes ORDER BY city COLLATE NOCASE`).all();
  return new Response(JSON.stringify({ ok: true, routes: rows.results || [] }), { status: 200, headers: jsonHeaders() });
}
async function upsertRoutes(request, env) {
  await ensureSchema(env);
  const data = await request.json().catch(() => ({}));
  let { cities, emails } = data || {};
  cities = (Array.isArray(cities) ? cities : String(cities || '')).split(/[;,]/).map(s => s.trim()).filter(Boolean);
  emails = parseEmails(emails);
  if (!cities.length || !emails.length) return jsonError(400, 'INVALID_INPUT');

  const emailString = Array.from(new Set(emails)).join(', ');
  const stmt = await env.DB.prepare(`INSERT INTO routes (city, email) VALUES (?,?)
    ON CONFLICT(city) DO UPDATE SET email=excluded.email`);
  for (const c of cities) {
    await stmt.bind(c, emailString).run();
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() });
}
async function deleteRoute(env, city) {
  if (!city) return jsonError(400, 'INVALID_CITY');
  await env.DB.prepare(`DELETE FROM routes WHERE lower(city)=lower(?)`).bind(city).run();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() });
}

/* ---- Admin: settings ---- */
async function getSettings(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key='default_email'`).first();
  return new Response(JSON.stringify({ ok: true, default_email: row?.value || env.DEFAULT_EMAIL || '' }), { status: 200, headers: jsonHeaders() });
}
async function setSettings(request, env) {
  await ensureSchema(env);
  const data = await request.json().catch(() => ({}));
  const { default_email } = data || {};
  if (!default_email) return jsonError(400, 'INVALID_EMAIL');
  await env.DB.prepare(`INSERT INTO settings (key,value) VALUES ('default_email', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(default_email).run();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() });
}

/* ---- Admin: leads ---- */
async function listLeads(request, env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10)));
  const rows = await env.DB.prepare(`SELECT id, created_at, phone, city, summary FROM leads ORDER BY id DESC LIMIT ?`).bind(limit).all();
  return new Response(JSON.stringify({ ok: true, leads: rows.results || [] }), { status: 200, headers: jsonHeaders() });
}

/* ---- Admin: usuarios ---- */
async function listUsers(env) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(`SELECT username FROM users ORDER BY username`).all();
  return new Response(JSON.stringify({ ok: true, users: rows.results || [] }), { status: 200, headers: jsonHeaders() });
}
async function createUser(request, env) {
  await ensureSchema(env);
  const data = await request.json().catch(() => ({}));
  let { username, password } = data || {};
  if (!username || !password) return jsonError(400, 'INVALID_INPUT');
  username = String(username).trim().toLowerCase();
  const pass_hash = await hashPassword(password);
  try {
    await env.DB.prepare(`INSERT INTO users (username, pass_hash) VALUES (?,?)`).bind(username, pass_hash).run();
  } catch (e) {
    return jsonError(400, 'USER_EXISTS');
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() });
}
async function deleteUser(env, username) {
  if (!username) return jsonError(400, 'INVALID_INPUT');
  await env.DB.prepare(`DELETE FROM users WHERE username=?`).bind(username).run();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders() });
}

/* ---- util ---- */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
