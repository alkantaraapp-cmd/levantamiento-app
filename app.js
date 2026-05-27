/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const CFG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby21sZnz9WYJOtrYWKDzzpQPe2Q6vGKon31m-Ryyfk/dev/exec',
  APP_NAME: 'Sistema de Levantamiento'
};

/* ============================================================
   USUARIOS POR DEFECTO
   Puedes agregar más desde el panel de Admin
   ============================================================ */
const DEFAULT_USERS = [
  { id: 1, nombre: 'Administrador', usuario: 'admin', pass: 'admin123', rol: 'admin', forms: [1,2,3] },
  { id: 2, nombre: 'Supervisor',    usuario: 'super', pass: 'super123', rol: 'supervisor', forms: [1,2,3] },
  { id: 3, nombre: 'Empleado 1',    usuario: 'emp1',  pass: 'emp123',   rol: 'empleado',   forms: [1] },
];

const FORM_NAMES = {
  1: { name: 'Levantamiento de Contribuyentes', icon: '👤', sheet: 'Contribuyentes' },
  2: { name: 'Levantamiento de Datos',          icon: '📊', sheet: 'Datos' },
  3: { name: 'Levantamiento de Construcción',   icon: '🏗️', sheet: 'Construccion' },
};

/* ============================================================
   ESTADO
   ============================================================ */
let currentUser = null;
let db = null;
let isOnline = navigator.onLine;
let menuOpen = false;

/* ============================================================
   INDEXEDDB
   ============================================================ */
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('LevantamientoDB', 2);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('registros')) {
        const s = d.createObjectStore('registros', { keyPath: 'id', autoIncrement: true });
        s.createIndex('formId', 'formId'); s.createIndex('status', 'status');
      }
      if (!d.objectStoreNames.contains('usuarios')) {
        d.createObjectStore('usuarios', { keyPath: 'id', autoIncrement: true });
      }
      if (!d.objectStoreNames.contains('custom_forms')) {
        d.createObjectStore('custom_forms', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = e => rej(e.target.error);
  });
}

function dbAll(store) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function dbAdd(store, data) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(data);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function dbPut(store, data) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(data);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function dbDelete(store, id) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

/* ============================================================
   USUARIOS (localStorage como cache rápido + IndexedDB)
   ============================================================ */
function getUsers() {
  const saved = localStorage.getItem('app_users');
  return saved ? JSON.parse(saved) : DEFAULT_USERS;
}
function saveUsers(users) {
  localStorage.setItem('app_users', JSON.stringify(users));
}

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */
function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');

  const users = getUsers();
  const found = users.find(x => x.usuario === u && x.pass === p);

  if (!found) {
    err.textContent = '⚠️ Usuario o contraseña incorrectos.';
    err.style.display = 'block';
    return;
  }

  err.style.display = 'none';
  currentUser = found;
  localStorage.setItem('session', JSON.stringify(found));
  startApp();
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem('session');
  document.getElementById('screen-app').style.display = 'none';
  document.getElementById('screen-login').classList.add('active');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  closeMenu();
}

function restoreSession() {
  const s = localStorage.getItem('session');
  if (s) {
    currentUser = JSON.parse(s);
    // Re-validar contra lista de usuarios actualizada
    const users = getUsers();
    const valid = users.find(x => x.id === currentUser.id && x.pass === currentUser.pass);
    if (valid) { currentUser = valid; return true; }
  }
  return false;
}

function togglePass() {
  const i = document.getElementById('login-pass');
  i.type = i.type === 'password' ? 'text' : 'password';
}

/* ============================================================
   INICIAR APP
   ============================================================ */
function startApp() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-app').style.display = 'block';

  // Header usuario
  document.getElementById('menu-name').textContent = currentUser.nombre;
  document.getElementById('menu-role').textContent = rolLabel(currentUser.rol);
  document.getElementById('menu-avatar').textContent = currentUser.nombre.charAt(0).toUpperCase();
  document.getElementById('welcome-name').textContent = currentUser.nombre.split(' ')[0];

  buildMenu();
  buildHomeCards();
  setTodayDates();
  prefillLevantadoPor();
  updatePending();
  showView('home');
}

function rolLabel(r) {
  return { admin: 'Administrador', supervisor: 'Supervisor', empleado: 'Empleado' }[r] || r;
}

/* ============================================================
   MENÚ LATERAL
   ============================================================ */
function buildMenu() {
  const links = document.getElementById('menu-links');
  const u = currentUser;
  let html = '';

  html += menuSection('Formularios');
  u.forms.forEach(fid => {
    const f = FORM_NAMES[fid];
    if (f) html += menuLink(f.icon, f.name, `showView('form${fid}')`);
  });

  // Formularios personalizados
  const customForms = getCustomForms();
  customForms.filter(cf => u.forms.includes('cf_'+cf.id) || u.rol === 'admin' || u.rol === 'supervisor')
    .forEach(cf => {
      html += menuLink(cf.icon || '📋', cf.name, `showCustomForm(${cf.id})`);
    });

  html += menuSection('Mis datos');
  html += menuLink('📋', 'Mis registros', `showView('history')`);

  if (u.rol === 'admin' || u.rol === 'supervisor') {
    html += menuSection('Reportes');
    html += menuLink('📈', 'Ver reportes', `showView('reports'); renderReports()`);
  }

  if (u.rol === 'admin') {
    html += menuSection('Administración');
    html += menuLink('👥', 'Gestionar usuarios', `showView('admin-users'); renderUsers()`);
    html += menuLink('🗂️', 'Gestionar formularios', `showView('admin-forms'); renderCustomForms()`);
  }

  links.innerHTML = html;
}

function menuSection(title) {
  return `<div class="menu-section">${title}</div>`;
}
function menuLink(icon, label, action) {
  return `<button class="menu-link" onclick="${action}; closeMenu()">
    <span class="ml-icon">${icon}</span> ${label}
  </button>`;
}

function buildHomeCards() {
  const u = currentUser;
  const grid = document.getElementById('home-cards');
  let html = '';

  u.forms.forEach(fid => {
    const f = FORM_NAMES[fid];
    if (!f) return;
    const count = getLocalCount(fid);
    html += `<div class="home-card" onclick="showView('form${fid}')">
      <div class="home-card-icon">${f.icon}</div>
      <div class="home-card-name">${f.name}</div>
      <div class="home-card-count">${count} registro(s) hoy</div>
    </div>`;
  });

  if (u.rol === 'admin' || u.rol === 'supervisor') {
    html += `<div class="home-card" onclick="showView('reports'); renderReports()">
      <div class="home-card-icon">📈</div>
      <div class="home-card-name">Reportes</div>
      <div class="home-card-count">Ver estadísticas</div>
    </div>`;
  }
  if (u.rol === 'admin') {
    html += `<div class="home-card" onclick="showView('admin-users'); renderUsers()">
      <div class="home-card-icon">👥</div>
      <div class="home-card-name">Usuarios</div>
      <div class="home-card-count">Gestionar accesos</div>
    </div>`;
  }

  grid.innerHTML = html;
}

function getLocalCount(formId) {
  const all = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const today = new Date().toISOString().split('T')[0];
  return all.filter(r => String(r.formId) === String(formId) && r.fecha && r.fecha.startsWith(today)).length;
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('view-' + name);
  if (v) { v.classList.add('active'); v.scrollTop = 0; }

  const titles = {
    'home': 'Inicio',
    'form1': 'Contribuyentes',
    'form2': 'Levantamiento de Datos',
    'form3': 'Construcción',
    'history': 'Mis registros',
    'admin-users': 'Usuarios',
    'admin-forms': 'Formularios',
    'reports': 'Reportes'
  };
  document.getElementById('header-title').textContent = titles[name] || name;
}

function toggleMenu() {
  menuOpen = !menuOpen;
  document.getElementById('side-menu').classList.toggle('open', menuOpen);
  document.getElementById('side-overlay').classList.toggle('open', menuOpen);
}
function closeMenu() { menuOpen = false; document.getElementById('side-menu').classList.remove('open'); document.getElementById('side-overlay').classList.remove('open'); }

/* ============================================================
   GPS
   ============================================================ */
function getGPS(prefix) {
  const coordsEl = document.getElementById(prefix + '_gps_coords');
  coordsEl.textContent = '📡 Obteniendo ubicación...';

  if (!navigator.geolocation) {
    coordsEl.textContent = 'GPS no disponible en este dispositivo';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      document.getElementById(prefix + '_lat').value = lat;
      document.getElementById(prefix + '_lng').value = lng;
      coordsEl.textContent = `✅ Lat: ${lat}, Lng: ${lng}`;
    },
    err => {
      coordsEl.textContent = '❌ No se pudo obtener la ubicación';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ============================================================
   FOTOS
   ============================================================ */
function takePhoto(prefix) {
  document.getElementById(prefix + '_camera_input').click();
}
function pickPhoto(prefix) {
  document.getElementById(prefix + '_photo_input').click();
}
function handlePhoto(prefix, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    document.getElementById(prefix + '_photo_data').value = data;
    const preview = document.getElementById(prefix + '_photo_preview');
    const ph = document.getElementById(prefix + '_photo_ph');
    preview.src = data;
    preview.style.display = 'block';
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   TOGGLE (Sí/No)
   ============================================================ */
function setToggle(fieldId, val, btn) {
  document.getElementById(fieldId).value = val;
  btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Mostrar/ocultar campos de publicidad en form1
  if (fieldId === 'f1_publicidad') {
    const pubFields = document.getElementById('f1_pub_fields');
    if (pubFields) pubFields.style.display = val === 'Sí' ? 'block' : 'none';
  }
}

/* ============================================================
   HELPERS
   ============================================================ */
function setTodayDates() {
  const today = new Date().toISOString().split('T')[0];
  ['f1_fecha','f2_fecha','f3_fecha'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

function prefillLevantadoPor() {
  ['f1_levantado_por','f2_levantado_por','f3_levantado_por'].forEach(id => {
    const el = document.getElementById(id);
    if (el && currentUser) el.value = currentUser.nombre;
  });
}

/* ============================================================
   SUBMIT FORMULARIOS
   ============================================================ */
const FORM_FIELDS = {
  1: ['nombres','apellidos','cedula','tel1','tel2','tipo_cliente','categoria','tarifa',
      'georef','sector','calle','casa_num','referencia','lat','lng',
      'publicidad','tipo_letrero','cantidad','medida',
      'photo_data','poligono','fecha','levantado_por'],
  2: ['nombre','rmc','tipo_cliente','lat','lng',
      'tipo_letrero','caracteristica','cantidad','photo_data',
      'medida','poligono','observacion','fecha','levantado_por'],
  3: ['lat','lng','photo_data','poligono','observacion','fecha','levantado_por'],
};

async function submitForm(formId) {
  const prefix = `f${formId}_`;
  const fields = FORM_FIELDS[formId];
  const data = { formId, formName: FORM_NAMES[formId]?.name, userId: currentUser.id, userName: currentUser.nombre, status: 'pending', fecha: new Date().toISOString() };
  let valid = true;

  fields.forEach(f => {
    const el = document.getElementById(prefix + f);
    if (!el) return;
    const val = el.value || '';
    data[f] = val;

    // Validación básica de requeridos (no photo, no optional)
    const optionals = ['tel2','referencia','georef','observacion','tipo_letrero','cantidad','medida'];
    if (!val && !optionals.includes(f) && f !== 'photo_data' && f !== 'lat' && f !== 'lng') {
      el.classList.add('error');
      valid = false;
    } else {
      el.classList.remove('error');
    }
  });

  if (!valid) { showToast('⚠️ Completa los campos obligatorios'); return; }

  // Guardar en localStorage cache
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const newId = Date.now();
  data.localId = newId;
  cache.push(data);
  localStorage.setItem('registros_cache', JSON.stringify(cache));

  // Intentar enviar online
  if (isOnline) {
    try {
      await sendToSheets(data);
      updateCacheStatus(newId, 'synced');
      showOkModal('✅ Registro enviado', 'El registro se guardó y sincronizó con Google Sheets.');
    } catch {
      showOkModal('📥 Guardado offline', 'Sin conexión al servidor. Se sincronizará automáticamente.');
    }
  } else {
    showOkModal('📥 Guardado offline', 'Sin internet. El registro se guardará y sincronizará al conectarse.');
  }

  resetForm(formId);
  updatePending();
}

function updateCacheStatus(localId, status) {
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const idx = cache.findIndex(r => r.localId === localId);
  if (idx >= 0) { cache[idx].status = status; localStorage.setItem('registros_cache', JSON.stringify(cache)); }
}

function resetForm(formId) {
  const prefix = `f${formId}_`;
  const fields = FORM_FIELDS[formId];
  fields.forEach(f => {
    const el = document.getElementById(prefix + f);
    if (el) el.value = '';
  });
  // Reset foto previews
  const prev = document.getElementById(prefix + 'photo_preview');
  if (prev) { prev.style.display = 'none'; prev.src = ''; }
  const ph = document.getElementById(prefix + 'photo_ph');
  if (ph) ph.style.display = 'flex';

  // Reset GPS
  const gps = document.getElementById(prefix + 'gps_coords');
  if (gps) gps.textContent = 'Sin ubicación capturada';

  // Reset toggle publicidad
  if (formId === 1) {
    const pubToggle = document.getElementById('f1_publicidad_toggle');
    if (pubToggle) {
      pubToggle.querySelectorAll('.toggle-btn').forEach((b,i) => b.classList.toggle('active', i===0));
      document.getElementById('f1_publicidad').value = 'No';
      document.getElementById('f1_pub_fields').style.display = 'none';
    }
  }

  setTodayDates();
  prefillLevantadoPor();
}

/* ============================================================
   SYNC
   ============================================================ */
async function sendToSheets(data) {
  // Enviar sin la foto base64 si es muy grande (opcional: enviar aparte)
  const payload = { ...data };
  // Mantener foto pero si el script da error por tamaño, comentar la línea de abajo
  // payload.photo_data = ''; // descomentar si la foto da problemas de tamaño

  await fetch(CFG.SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function syncAll() {
  if (!isOnline) { showToast('Sin conexión a internet'); return; }
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const pending = cache.filter(r => r.status === 'pending');
  if (!pending.length) { showToast('✅ Todo sincronizado'); return; }

  showToast(`⏳ Sincronizando ${pending.length} registro(s)...`);
  let ok = 0;
  for (const r of pending) {
    try { await sendToSheets(r); updateCacheStatus(r.localId, 'synced'); ok++; } catch {}
  }
  showToast(`✅ ${ok}/${pending.length} sincronizados`);
  updatePending();
}

async function updatePending() {
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const n = cache.filter(r => r.status === 'pending').length;
  const banner = document.getElementById('pending-banner');
  if (banner) {
    banner.style.display = n > 0 ? 'flex' : 'none';
    const el = document.getElementById('pending-num');
    if (el) el.textContent = n;
  }
}

/* ============================================================
   HISTORIAL
   ============================================================ */
function renderHistory() {
  const fFilter = document.getElementById('history-filter')?.value;
  const sFilter = document.getElementById('history-status')?.value;
  const list = document.getElementById('history-list');

  let cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  if (currentUser.rol === 'empleado') cache = cache.filter(r => r.userId === currentUser.id);
  if (fFilter) cache = cache.filter(r => String(r.formId) === fFilter);
  if (sFilter) cache = cache.filter(r => r.status === sFilter);
  cache = [...cache].reverse();

  if (!cache.length) { list.innerHTML = `<div class="history-empty">📭 No hay registros.</div>`; return; }

  list.innerHTML = cache.map(r => {
    const f = FORM_NAMES[r.formId] || { icon: '📋', name: r.formName || 'Formulario' };
    const statusClass = { pending: 's-pending', synced: 's-synced', error: 's-error' }[r.status] || 's-pending';
    const statusLabel = { pending: 'Pendiente', synced: 'Sincronizado', error: 'Error' }[r.status] || r.status;
    const date = r.fecha ? new Date(r.fecha).toLocaleString('es-DO') : '—';
    const name = r.nombres || r.nombre || '—';

    return `<div class="h-card">
      <div class="h-card-top">
        <div class="h-card-name">${f.icon} ${f.name}</div>
        <span class="status-pill ${statusClass}">${statusLabel}</span>
      </div>
      <div class="h-card-meta">
        <span>👤 ${name}</span>
        <span>📅 ${date}</span>
        <span>📌 ${r.sector || r.poligono || '—'}</span>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   REPORTES
   ============================================================ */
function renderReports() {
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const total = cache.length;
  const pending = cache.filter(r => r.status === 'pending').length;
  const synced = cache.filter(r => r.status === 'synced').length;

  document.getElementById('report-cards').innerHTML = `
    <div class="report-stat"><div class="rs-num">${total}</div><div class="rs-label">Total</div></div>
    <div class="report-stat"><div class="rs-num" style="color:var(--warning)">${pending}</div><div class="rs-label">Pendientes</div></div>
    <div class="report-stat"><div class="rs-num" style="color:var(--success)">${synced}</div><div class="rs-label">Sincronizados</div></div>
  `;

  const recent = [...cache].reverse().slice(0, 20);
  const rows = recent.map(r => {
    const f = FORM_NAMES[r.formId] || { name: r.formName || '—' };
    const date = r.fecha ? new Date(r.fecha).toLocaleString('es-DO') : '—';
    const statusClass = { pending: 's-pending', synced: 's-synced' }[r.status] || '';
    const statusLabel = { pending: 'Pendiente', synced: 'Sync' }[r.status] || r.status;
    return `<tr>
      <td>${f.name}</td>
      <td>${r.nombres || r.nombre || '—'}</td>
      <td>${r.userName || '—'}</td>
      <td>${date}</td>
      <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('report-table-wrap').innerHTML = `
    <table class="report-table">
      <thead><tr><th>Formulario</th><th>Contribuyente</th><th>Usuario</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sin registros</td></tr>'}</tbody>
    </table>`;
}

/* ============================================================
   ADMIN - USUARIOS
   ============================================================ */
function renderUsers() {
  const users = getUsers();
  const list = document.getElementById('users-list');
  list.innerHTML = users.map(u => `
    <div class="admin-card">
      <div class="admin-card-info">
        <div class="admin-card-name">${u.nombre}</div>
        <div class="admin-card-sub">@${u.usuario} · ${rolLabel(u.rol)} · Formularios: ${u.forms.join(', ')}</div>
      </div>
      <div class="admin-card-actions">
        <button class="btn-edit" onclick="openUserModal(${u.id})">✏️</button>
        ${u.id !== currentUser.id ? `<button class="btn-del" onclick="deleteUser(${u.id})">🗑️</button>` : ''}
      </div>
    </div>
  `).join('') || '<div class="history-empty">Sin usuarios</div>';
}

function openUserModal(id) {
  document.getElementById('mu_nombre').value = '';
  document.getElementById('mu_user').value = '';
  document.getElementById('mu_pass').value = '';
  document.getElementById('mu_rol').value = 'empleado';
  document.getElementById('mu_edit_id').value = '';
  document.querySelectorAll('#mu_perms input[type=checkbox]').forEach(cb => cb.checked = false);
  document.getElementById('modal-user-title').textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';

  if (id) {
    const u = getUsers().find(x => x.id === id);
    if (!u) return;
    document.getElementById('mu_nombre').value = u.nombre;
    document.getElementById('mu_user').value = u.usuario;
    document.getElementById('mu_pass').value = u.pass;
    document.getElementById('mu_rol').value = u.rol;
    document.getElementById('mu_edit_id').value = u.id;
    document.querySelectorAll('#mu_perms input[type=checkbox]').forEach(cb => {
      cb.checked = u.forms.includes(Number(cb.value)) || u.forms.includes('cf_'+cb.value);
    });
  }
  document.getElementById('modal-user').style.display = 'flex';
}
function closeUserModal() { document.getElementById('modal-user').style.display = 'none'; }

function saveUser() {
  const nombre = document.getElementById('mu_nombre').value.trim();
  const usuario = document.getElementById('mu_user').value.trim();
  const pass = document.getElementById('mu_pass').value.trim();
  const rol = document.getElementById('mu_rol').value;
  const editId = document.getElementById('mu_edit_id').value;
  const forms = [...document.querySelectorAll('#mu_perms input[type=checkbox]:checked')].map(cb => Number(cb.value));

  if (!nombre || !usuario || !pass) { showToast('⚠️ Completa todos los campos'); return; }

  const users = getUsers();
  if (editId) {
    const idx = users.findIndex(u => u.id === Number(editId));
    if (idx >= 0) users[idx] = { ...users[idx], nombre, usuario, pass, rol, forms };
  } else {
    const maxId = Math.max(0, ...users.map(u => u.id));
    users.push({ id: maxId + 1, nombre, usuario, pass, rol, forms });
  }
  saveUsers(users);
  closeUserModal();
  renderUsers();
  showToast('✅ Usuario guardado');
}

function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  const users = getUsers().filter(u => u.id !== id);
  saveUsers(users);
  renderUsers();
  showToast('Usuario eliminado');
}

/* ============================================================
   ADMIN - FORMULARIOS PERSONALIZADOS
   ============================================================ */
function getCustomForms() {
  return JSON.parse(localStorage.getItem('custom_forms') || '[]');
}
function saveCustomForms(forms) {
  localStorage.setItem('custom_forms', JSON.stringify(forms));
}

function renderCustomForms() {
  const forms = getCustomForms();
  const list = document.getElementById('custom-forms-list');
  list.innerHTML = forms.map(f => `
    <div class="admin-card">
      <div class="admin-card-info">
        <div class="admin-card-name">${f.icon || '📋'} ${f.name}</div>
        <div class="admin-card-sub">${f.fields?.length || 0} campos</div>
      </div>
      <div class="admin-card-actions">
        <button class="btn-del" onclick="deleteCustomForm(${f.id})">🗑️</button>
      </div>
    </div>
  `).join('') || '<div class="history-empty">No hay formularios personalizados.<br>Crea uno con el botón +</div>';
}

function openFormBuilder() {
  document.getElementById('fb_name').value = '';
  document.getElementById('fb_icon').value = '📋';
  document.getElementById('fb_fields_list').innerHTML = '';
  addBuilderField(); // al menos un campo
  document.getElementById('modal-formbuilder').style.display = 'flex';
}
function closeFormBuilder() { document.getElementById('modal-formbuilder').style.display = 'none'; }

function addBuilderField() {
  const container = document.getElementById('fb_fields_list');
  const idx = container.children.length;
  const div = document.createElement('div');
  div.className = 'fb-field-row';
  div.innerHTML = `
    <input type="text" placeholder="Nombre del campo" class="fb-fname">
    <select class="fb-ftype">
      <option value="text">Texto</option>
      <option value="number">Número</option>
      <option value="date">Fecha</option>
      <option value="textarea">Texto largo</option>
      <option value="select">Lista</option>
    </select>
    <button class="fb-del" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(div);
}

function saveCustomForm() {
  const name = document.getElementById('fb_name').value.trim();
  const icon = document.getElementById('fb_icon').value.trim() || '📋';
  if (!name) { showToast('⚠️ Nombre del formulario requerido'); return; }

  const rows = document.querySelectorAll('.fb-field-row');
  const fields = [];
  rows.forEach(row => {
    const fname = row.querySelector('.fb-fname').value.trim();
    const ftype = row.querySelector('.fb-ftype').value;
    if (fname) fields.push({ name: fname, type: ftype });
  });

  if (!fields.length) { showToast('⚠️ Agrega al menos un campo'); return; }

  const forms = getCustomForms();
  const maxId = Math.max(0, ...forms.map(f => f.id));
  forms.push({ id: maxId + 1, name, icon, fields, sheet: name.replace(/\s+/g,'_') });
  saveCustomForms(forms);

  closeFormBuilder();
  renderCustomForms();
  buildMenu(); // actualizar menú lateral
  showToast('✅ Formulario creado');
}

function deleteCustomForm(id) {
  if (!confirm('¿Eliminar este formulario?')) return;
  const forms = getCustomForms().filter(f => f.id !== id);
  saveCustomForms(forms);
  renderCustomForms();
  buildMenu();
  showToast('Formulario eliminado');
}

function showCustomForm(id) {
  const forms = getCustomForms();
  const cf = forms.find(f => f.id === id);
  if (!cf) return;

  // Render dinámico del formulario personalizado
  const content = document.getElementById('app-content');
  let viewId = 'view-custom-' + id;
  let existing = document.getElementById(viewId);
  if (!existing) {
    existing = document.createElement('div');
    existing.id = viewId;
    existing.className = 'view';
    existing.innerHTML = `<div class="form-scroll">
      <div class="form-section-header">
        <div class="section-icon">${cf.icon}</div>
        <div><div class="section-title">${cf.name}</div><div class="section-sub">Formulario personalizado</div></div>
      </div>
      <div class="fields-grid">
        ${cf.fields.map(f => `
          <div class="field-group full">
            <label>${f.name}</label>
            ${f.type === 'textarea' ? `<textarea id="cf${id}_${sanitizeId(f.name)}" rows="3" placeholder="${f.name}"></textarea>`
              : f.type === 'select' ? `<select id="cf${id}_${sanitizeId(f.name)}"><option value="">Selecciona...</option></select>`
              : `<input type="${f.type}" id="cf${id}_${sanitizeId(f.name)}" placeholder="${f.name}">`}
          </div>
        `).join('')}
        <div class="field-group full"><label>Fecha</label><input type="date" id="cf${id}_fecha" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="field-group full"><label>Levantado por</label><input type="text" id="cf${id}_levantado" value="${currentUser?.nombre || ''}"></div>
      </div>
      <button class="btn-submit" onclick="submitCustomForm(${id})">💾 Guardar registro</button>
    </div>`;
    content.appendChild(existing);
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  existing.classList.add('active');
  document.getElementById('header-title').textContent = cf.name;
}

function sanitizeId(str) { return str.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); }

function submitCustomForm(id) {
  const forms = getCustomForms();
  const cf = forms.find(f => f.id === id);
  if (!cf) return;

  const data = { formId: 'cf_'+id, formName: cf.name, sheet: cf.sheet, userId: currentUser.id, userName: currentUser.nombre, status: 'pending', fecha: new Date().toISOString() };
  cf.fields.forEach(f => {
    const el = document.getElementById(`cf${id}_${sanitizeId(f.name)}`);
    data[sanitizeId(f.name)] = el ? el.value : '';
  });
  data.fecha_registro = document.getElementById(`cf${id}_fecha`)?.value || '';
  data.levantado = document.getElementById(`cf${id}_levantado`)?.value || '';

  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  data.localId = Date.now();
  cache.push(data);
  localStorage.setItem('registros_cache', JSON.stringify(cache));

  showOkModal('✅ Registro guardado', 'Se guardó localmente. Se sincronizará al conectarse.');
  updatePending();
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function showToast(msg, ms = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

function showOkModal(title, msg) {
  document.getElementById('ok-title').textContent = title;
  document.getElementById('ok-msg').textContent = msg;
  document.getElementById('modal-ok').style.display = 'flex';
}
function closeOkModal() {
  document.getElementById('modal-ok').style.display = 'none';
  showView('home');
}

/* ============================================================
   ONLINE / OFFLINE
   ============================================================ */
function updateOnlineStatus() {
  isOnline = navigator.onLine;
  const dot = document.getElementById('online-dot');
  if (dot) { dot.className = 'online-dot ' + (isOnline ? 'online' : 'offline'); dot.title = isOnline ? 'En línea' : 'Sin conexión'; }
  if (isOnline) syncAll();
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  await openDB();
  updateOnlineStatus();

  if (restoreSession()) {
    startApp();
  }

  // Enter en login
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-user')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
