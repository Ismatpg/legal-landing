// Configura la URL base de tu Worker API:
const CF_API_BASE = "https://lead-api.ismael-guijarro-raissouni.workers.dev";

const q = (s) => document.querySelector(s);
const usersBody = q('#users-body');
const statusEl = q('#user-status');
const form = q('#user-form');

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status === 401) { location.href = 'login.html'; return {}; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ERROR');
  return data;
}

async function loadUsers() {
  const data = await fetchJSON(`${CF_API_BASE}/api/admin/users`);
  usersBody.innerHTML = '';
  (data.users || []).forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.username}</td>`;
    usersBody.appendChild(tr);
  });
}

async function createUser(e) {
  e.preventDefault();
  statusEl.textContent = '';
  const username = q('#new-username').value.trim();
  const password = q('#new-password').value.trim();
  if (!username || !password) { statusEl.textContent = 'Rellena usuario y contraseña.'; return; }
  try {
    await fetchJSON(`${CF_API_BASE}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    q('#new-username').value = '';
    q('#new-password').value = '';
    statusEl.textContent = 'Usuario creado ✓';
    statusEl.style.color = '#0f5132';
    await loadUsers();
  } catch {
    statusEl.textContent = 'Error creando usuario';
  }
}

q('#btn-logout').addEventListener('click', async () => {
  await fetch(`${CF_API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  location.href = 'login.html';
});

form.addEventListener('submit', createUser);

(async function(){
  try { await loadUsers(); } catch(e){}
})();
