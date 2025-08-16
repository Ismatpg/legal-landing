// Configura la URL base de tu Worker API:
const CF_API_BASE = "https://lead-api.ismael-guijarro-raissouni.workers.dev";

const q = (s) => document.querySelector(s);
const routesBody = q('#routes-body');
const leadsBody = q('#leads-body');
const defaultForm = q('#form-default');
const defaultEmail = q('#default_email');
const defaultStatus = q('#default-status');
const ruleForm = q('#form-rule');
const ruleStatus = q('#rule-status');

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status === 401) { location.href = 'login.html'; return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ERROR');
  return data;
}

async function loadSettings() {
  const data = await fetchJSON(`${CF_API_BASE}/api/admin/settings`);
  defaultEmail.value = data.default_email || '';
}
async function saveSettings(e) {
  e.preventDefault();
  defaultStatus.textContent = '';
  try {
    await fetchJSON(`${CF_API_BASE}/api/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_email: defaultEmail.value.trim() })
    });
    defaultStatus.textContent = 'Guardado ✓'; defaultStatus.style.color = '#0f5132';
  } catch (err) { defaultStatus.textContent = 'Error guardando.'; }
}

function renderRoutes(list) {
  routesBody.innerHTML = '';
  list.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.city}</td>
      <td>${r.email}</td>
      <td style="text-align:right">
        <button class="secondary btn-secondary btn-del" data-city="${encodeURIComponent(r.city)}">Eliminar</button>
      </td>`;
    routesBody.appendChild(tr);
  });

  routesBody.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await fetchJSON(`${CF_API_BASE}/api/admin/routes/${btn.dataset.city}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
        await loadRoutes();
      } catch { alert('Error eliminando'); }
    });
  });
}
async function loadRoutes() {
  const data = await fetchJSON(`${CF_API_BASE}/api/admin/routes`);
  renderRoutes(data.routes || []);
}
async function saveRule(e) {
  e.preventDefault();
  ruleStatus.textContent = '';
  const cities = q('#cities').value.trim();
  const emails = q('#emails').value.trim();
  if (!cities || !emails) { ruleStatus.textContent = 'Rellena ciudades y emails.'; return; }
  try {
    await fetchJSON(`${CF_API_BASE}/api/admin/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cities, emails })
    });
    q('#cities').value = ''; q('#emails').value = '';
    await loadRoutes();
    ruleStatus.textContent = 'Regla guardada ✓'; ruleStatus.style.color = '#0f5132';
  } catch { ruleStatus.textContent = 'Error guardando'; }
}

function renderLeads(list) {
  leadsBody.innerHTML = '';
  list.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(l.created_at).toLocaleString()}</td><td>${l.phone}</td><td>${l.city}</td><td>${escapeHtml(l.summary)}</td>`;
    leadsBody.appendChild(tr);
  });
}
async function loadLeads() {
  const data = await fetchJSON(`${CF_API_BASE}/api/admin/leads?limit=50`);
  renderLeads(data.leads || []);
}

q('#btn-logout').addEventListener('click', async () => {
  await fetch(`${CF_API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  location.href = 'login.html';
});

defaultForm.addEventListener('submit', saveSettings);
ruleForm.addEventListener('submit', saveRule);

// init
(async function(){
  try {
    await loadSettings();
    await loadRoutes();
    await loadLeads();
  } catch (e) {
    // si hay 401 redirige en fetchJSON
  }
})();

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
