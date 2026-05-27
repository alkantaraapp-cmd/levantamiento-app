/* ============================================================
   CONFIGURACIÓN - Pega tu URL de Apps Script aquí
   ============================================================ */
const CFG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyZi6k_WVM8xy5WvFYY14n1utirl5oaMPa-LKvYGQhTDOw_SAZxfl2J_7A6k4gLD2-9/exec',
  APP_NAME: 'Sistema de Levantamiento'
};

const DEFAULT_USERS = [
  { id: 1, nombre: 'Administrador', usuario: 'admin', pass: 'admin123', rol: 'admin', forms: [1,2,3] },
  { id: 2, nombre: 'Supervisor',    usuario: 'super', pass: 'super123', rol: 'supervisor', forms: [1,2,3] },
  { id: 3, nombre: 'Empleado 1',    usuario: 'emp1',  pass: 'emp123',   rol: 'empleado',   forms: [1] },
];

const FORM_NAMES = {
  1: { name: 'Levantamiento de Contribuyentes', icon: '👤', sheet: 'Contribuyentes' },
  2: { name: 'Levantamiento de Datos',          icon: '📊', sheet: 'Datos' },
  3: { name: 'Levantamiento de Construccion',   icon: '🏗️', sheet: 'Construccion' },
};

// SOLO campos de texto puro son obligatorios — selects y numéricos son opcionales en validación estricta
const REQUIRED = {
  1: ['f1_nombres','f1_apellidos','f1_cedula','f1_tel1','f1_tipo_cliente','f1_categoria','f1_tarifa','f1_sector','f1_calle','f1_casa_num','f1_poligono','f1_fecha','f1_levantado_por'],
  2: ['f2_nombre','f2_rmc','f2_poligono','f2_fecha','f2_levantado_por'],
  3: ['f3_poligono','f3_fecha','f3_levantado_por'],
};

let currentUser = null;
let isOnline = navigator.onLine;
let menuOpen = false;

/* ============================================================
   USUARIOS
   ============================================================ */
function getUsers() {
  try { return JSON.parse(localStorage.getItem('app_users')) || DEFAULT_USERS; } catch(e) { return DEFAULT_USERS; }
}
function saveUsers(u) { localStorage.setItem('app_users', JSON.stringify(u)); }

/* ============================================================
   LOGIN
   ============================================================ */
function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');

  if (!u || !p) { err.textContent = '⚠️ Ingresa usuario y contraseña.'; err.style.display = 'block'; return; }

  const found = getUsers().find(x => x.usuario === u && x.pass === p);
  if (!found) { err.textContent = '❌ Usuario o contraseña incorrectos.'; err.style.display = 'block'; return; }

  err.style.display = 'none';
  currentUser = found;
  localStorage.setItem('session', JSON.stringify(found));
  startApp();
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem('session');
  document.getElementById('screen-app').style.display = 'none';
  document.getElementById('screen-login').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
  closeMenu();
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem('session'));
    if (!saved) return false;
    const valid = getUsers().find(x => x.id === saved.id && x.pass === saved.pass);
    if (valid) { currentUser = valid; return true; }
  } catch(e) {}
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
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('screen-app').style.display = 'block';
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
   MENÚ
   ============================================================ */
function buildMenu() {
  const links = document.getElementById('menu-links');
  const u = currentUser;
  let html = '';

  html += mSection('Formularios');
  u.forms.forEach(fid => {
    const f = FORM_NAMES[fid];
    if (f) html += mLink(f.icon, f.name, `goForm(${fid})`);
  });
  getCustomForms().forEach(cf => {
    html += mLink(cf.icon || '📋', cf.name, `showCustomForm(${cf.id})`);
  });

  html += mSection('Mis datos');
  html += mLink('📋', 'Mis registros', `goView('history')`);

  if (u.rol === 'admin' || u.rol === 'supervisor') {
    html += mSection('Reportes');
    html += mLink('📈', 'Ver reportes', `goView('reports')`);
  }
  if (u.rol === 'admin') {
    html += mSection('Administración');
    html += mLink('👥', 'Gestionar usuarios', `goView('admin-users')`);
    html += mLink('🗂️', 'Gestionar formularios', `goView('admin-forms')`);
  }
  links.innerHTML = html;
}

function mSection(t) { return `<div class="menu-section">${t}</div>`; }
function mLink(icon, label, action) {
  return `<button class="menu-link" onclick="${action}; closeMenu()"><span class="ml-icon">${icon}</span> ${label}</button>`;
}

function goForm(fid) { showView('form' + fid); closeMenu(); }
function goView(name) {
  showView(name); closeMenu();
  if (name === 'history')     renderHistory();
  if (name === 'reports')     renderReports();
  if (name === 'admin-users') renderUsers();
  if (name === 'admin-forms') renderCustomForms();
}

function buildHomeCards() {
  const u = currentUser;
  let html = '';
  u.forms.forEach(fid => {
    const f = FORM_NAMES[fid];
    if (!f) return;
    html += `<div class="home-card" onclick="showView('form${fid}')">
      <div class="home-card-icon">${f.icon}</div>
      <div class="home-card-name">${f.name}</div>
    </div>`;
  });
  if (u.rol === 'admin' || u.rol === 'supervisor') {
    html += `<div class="home-card" onclick="goView('reports')"><div class="home-card-icon">📈</div><div class="home-card-name">Reportes</div></div>`;
  }
  if (u.rol === 'admin') {
    html += `<div class="home-card" onclick="goView('admin-users')"><div class="home-card-icon">👥</div><div class="home-card-name">Usuarios</div></div>`;
    html += `<div class="home-card" onclick="goView('admin-forms')"><div class="home-card-icon">🗂️</div><div class="home-card-name">Formularios</div></div>`;
  }
  document.getElementById('home-cards').innerHTML = html;
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function showView(name) {
  document.querySelectorAll('#app-content .view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('view-' + name);
  if (v) { v.classList.add('active'); v.scrollTop = 0; }
  const titles = { home:'Inicio', form1:'Contribuyentes', form2:'Levantamiento de Datos', form3:'Construcción', history:'Mis registros', 'admin-users':'Usuarios', 'admin-forms':'Formularios', reports:'Reportes' };
  document.getElementById('header-title').textContent = titles[name] || name;
}

function toggleMenu() {
  menuOpen = !menuOpen;
  document.getElementById('side-menu').classList.toggle('open', menuOpen);
  document.getElementById('side-overlay').classList.toggle('open', menuOpen);
}
function closeMenu() {
  menuOpen = false;
  document.getElementById('side-menu').classList.remove('open');
  document.getElementById('side-overlay').classList.remove('open');
}

/* ============================================================
   GPS
   ============================================================ */
function getGPS(prefix) {
  const el = document.getElementById(prefix + '_gps_coords');
  el.textContent = '📡 Obteniendo ubicación...';
  if (!navigator.geolocation) { el.textContent = 'GPS no disponible'; return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      document.getElementById(prefix + '_lat').value = lat;
      document.getElementById(prefix + '_lng').value = lng;
      el.textContent = `✅ Lat: ${lat}, Lng: ${lng}`;
    },
    () => { el.textContent = '❌ No se pudo obtener la ubicación'; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ============================================================
   FOTOS
   ============================================================ */
function takePhoto(p) { document.getElementById(p + '_camera_input').click(); }
function pickPhoto(p) { document.getElementById(p + '_photo_input').click(); }
function handlePhoto(p, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById(p + '_photo_data').value = e.target.result;
    const prev = document.getElementById(p + '_photo_preview');
    const ph   = document.getElementById(p + '_photo_ph');
    prev.src = e.target.result; prev.style.display = 'block';
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   TOGGLE Sí/No
   ============================================================ */
function setToggle(fieldId, val, btn) {
  document.getElementById(fieldId).value = val;
  btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (fieldId === 'f1_publicidad') {
    const pub = document.getElementById('f1_pub_fields');
    if (pub) pub.style.display = val === 'Sí' ? 'block' : 'none';
  }
}

/* ============================================================
   HELPERS
   ============================================================ */
function setTodayDates() {
  const today = new Date().toISOString().split('T')[0];
  ['f1_fecha','f2_fecha','f3_fecha'].forEach(id => { const el = document.getElementById(id); if (el) el.value = today; });
}
function prefillLevantadoPor() {
  ['f1_levantado_por','f2_levantado_por','f3_levantado_por'].forEach(id => {
    const el = document.getElementById(id);
    if (el && currentUser) el.value = currentUser.nombre;
  });
}

/* ============================================================
   SUBMIT — validación simple y directa
   ============================================================ */
async function submitForm(formId) {
  const required = REQUIRED[formId];
  let valid = true;
  let firstErr = null;

  // Limpiar errores anteriores en toda la vista
  document.querySelectorAll(`#view-form${formId} .error`).forEach(el => el.classList.remove('error'));

  // Validar solo los requeridos
  required.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.value.trim()) {
      el.classList.add('error');
      valid = false;
      if (!firstErr) firstErr = el;
    }
  });

  if (!valid) {
    showToast('⚠️ Completa los campos marcados en rojo');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Recopilar TODOS los campos del formulario (los que existan)
  const prefix = `f${formId}_`;
  const data = {
    formId,
    sheet: FORM_NAMES[formId].sheet,
    formName: FORM_NAMES[formId].name,
    userId: currentUser.id,
    userName: currentUser.nombre,
    status: 'pending',
    fecha: new Date().toISOString(),
    localId: Date.now()
  };

  // Recoger todos los inputs/selects/textareas del formulario
  document.querySelectorAll(`#view-form${formId} input, #view-form${formId} select, #view-form${formId} textarea`).forEach(el => {
    if (!el.id || el.type === 'file') return;
    const key = el.id.replace(prefix, '');
    data[key] = el.value || '';
  });

  // Guardar en localStorage
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  cache.push(data);
  localStorage.setItem('registros_cache', JSON.stringify(cache));

  // Sincronizar si hay conexión
  if (isOnline) {
    try {
      await sendToSheets(data);
      updateCacheStatus(data.localId, 'synced');
      showOkModal('✅ Registro enviado', 'Guardado y sincronizado con Google Sheets correctamente.');
    } catch(e) {
      showOkModal('📥 Guardado sin conexión', 'Se guardó localmente. Se enviará a Google Sheets cuando haya internet.');
    }
  } else {
    showOkModal('📥 Guardado sin conexión', 'Sin internet. Se enviará automáticamente al conectarse.');
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
  // Limpiar todos los campos del formulario
  document.querySelectorAll(`#view-form${formId} input, #view-form${formId} select, #view-form${formId} textarea`).forEach(el => {
    if (el.type === 'file') return;
    el.value = '';
    el.classList.remove('error');
  });

  // Reset fotos
  const prev = document.getElementById(`f${formId}_photo_preview`);
  if (prev) { prev.style.display = 'none'; prev.src = ''; }
  const ph = document.getElementById(`f${formId}_photo_ph`);
  if (ph) ph.style.display = 'flex';

  // Reset GPS label
  const gps = document.getElementById(`f${formId}_gps_coords`);
  if (gps) gps.textContent = 'Sin ubicación capturada';

  // Reset toggle publicidad form1
  if (formId === 1) {
    const tog = document.getElementById('f1_publicidad_toggle');
    if (tog) {
      tog.querySelectorAll('.toggle-btn').forEach((b,i) => b.classList.toggle('active', i === 0));
      const pub = document.getElementById('f1_publicidad');
      if (pub) pub.value = 'No';
      const pubf = document.getElementById('f1_pub_fields');
      if (pubf) pubf.style.display = 'none';
    }
  }

  setTodayDates();
  prefillLevantadoPor();
}

/* ============================================================
   SYNC
   ============================================================ */
async function sendToSheets(data) {
  await fetch(CFG.SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

async function syncAll() {
  if (!isOnline) { showToast('Sin conexión a internet'); return; }
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const pending = cache.filter(r => r.status === 'pending');
  if (!pending.length) { showToast('✅ Todo está sincronizado'); return; }
  showToast(`⏳ Sincronizando ${pending.length} registro(s)...`);
  let ok = 0;
  for (const r of pending) {
    try { await sendToSheets(r); updateCacheStatus(r.localId, 'synced'); ok++; } catch {}
  }
  showToast(`✅ ${ok} de ${pending.length} sincronizados`);
  updatePending();
}

function updatePending() {
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  const n = cache.filter(r => r.status === 'pending').length;
  const banner = document.getElementById('pending-banner');
  if (banner) banner.style.display = n > 0 ? 'flex' : 'none';
  const el = document.getElementById('pending-num');
  if (el) el.textContent = n;
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

  if (!cache.length) { list.innerHTML = `<div class="history-empty">📭 No hay registros aún.</div>`; return; }

  list.innerHTML = cache.map(r => {
    const f = FORM_NAMES[r.formId] || { icon: '📋', name: r.formName || 'Formulario' };
    const sc = { pending:'s-pending', synced:'s-synced', error:'s-error' }[r.status] || 's-pending';
    const sl = { pending:'Pendiente', synced:'Sincronizado', error:'Error' }[r.status] || r.status;
    const date = r.fecha ? new Date(r.fecha).toLocaleString('es-DO') : '—';
    return `<div class="h-card">
      <div class="h-card-top">
        <div class="h-card-name">${f.icon} ${f.name}</div>
        <span class="status-pill ${sc}">${sl}</span>
      </div>
      <div class="h-card-meta">
        <span>👤 ${r.nombres || r.nombre || '—'}</span>
        <span>📅 ${date}</span>
        <span>📌 Polígono: ${r.poligono || '—'}</span>
        <span>🙍 ${r.userName || '—'}</span>
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
  const synced  = cache.filter(r => r.status === 'synced').length;
  document.getElementById('report-cards').innerHTML = `
    <div class="report-stat"><div class="rs-num">${total}</div><div class="rs-label">Total</div></div>
    <div class="report-stat"><div class="rs-num" style="color:var(--warning)">${pending}</div><div class="rs-label">Pendientes</div></div>
    <div class="report-stat"><div class="rs-num" style="color:var(--success)">${synced}</div><div class="rs-label">Sincronizados</div></div>`;
  const rows = [...cache].reverse().slice(0,30).map(r => {
    const f = FORM_NAMES[r.formId] || { name: r.formName || '—' };
    const date = r.fecha ? new Date(r.fecha).toLocaleString('es-DO') : '—';
    const sc = { pending:'s-pending', synced:'s-synced' }[r.status] || '';
    const sl = { pending:'Pendiente', synced:'Sync' }[r.status] || r.status;
    return `<tr><td>${f.name}</td><td>${r.nombres||r.nombre||'—'}</td><td>${r.userName||'—'}</td><td>${date}</td><td><span class="status-pill ${sc}">${sl}</span></td></tr>`;
  }).join('');
  document.getElementById('report-table-wrap').innerHTML = `
    <table class="report-table">
      <thead><tr><th>Formulario</th><th>Nombre</th><th>Usuario</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Sin registros</td></tr>'}</tbody>
    </table>`;
}

/* ============================================================
   ADMIN USUARIOS
   ============================================================ */
function renderUsers() {
  const list = document.getElementById('users-list');
  list.innerHTML = getUsers().map(u => `
    <div class="admin-card">
      <div class="admin-card-info">
        <div class="admin-card-name">${u.nombre}</div>
        <div class="admin-card-sub">@${u.usuario} · ${rolLabel(u.rol)} · Forms: ${u.forms.join(', ')}</div>
      </div>
      <div class="admin-card-actions">
        <button class="btn-edit" onclick="openUserModal(${u.id})">✏️ Editar</button>
        ${u.id !== currentUser.id ? `<button class="btn-del" onclick="deleteUser(${u.id})">🗑️</button>` : ''}
      </div>
    </div>`).join('') || '<div class="history-empty">Sin usuarios.</div>';
}

function openUserModal(id) {
  ['mu_nombre','mu_user','mu_pass'].forEach(x => document.getElementById(x).value = '');
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
    document.querySelectorAll('#mu_perms input[type=checkbox]').forEach(cb => { cb.checked = u.forms.includes(Number(cb.value)); });
  }
  document.getElementById('modal-user').style.display = 'flex';
}
function closeUserModal() { document.getElementById('modal-user').style.display = 'none'; }

function saveUser() {
  const nombre  = document.getElementById('mu_nombre').value.trim();
  const usuario = document.getElementById('mu_user').value.trim();
  const pass    = document.getElementById('mu_pass').value.trim();
  const rol     = document.getElementById('mu_rol').value;
  const editId  = document.getElementById('mu_edit_id').value;
  const forms   = [...document.querySelectorAll('#mu_perms input[type=checkbox]:checked')].map(cb => Number(cb.value));
  if (!nombre || !usuario || !pass) { showToast('⚠️ Completa nombre, usuario y contraseña'); return; }
  const users = getUsers();
  if (editId) {
    const idx = users.findIndex(u => u.id === Number(editId));
    if (idx >= 0) users[idx] = { ...users[idx], nombre, usuario, pass, rol, forms };
  } else {
    users.push({ id: Math.max(0, ...users.map(u => u.id)) + 1, nombre, usuario, pass, rol, forms });
  }
  saveUsers(users);
  closeUserModal();
  renderUsers();
  showToast('✅ Usuario guardado');
}

function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  saveUsers(getUsers().filter(u => u.id !== id));
  renderUsers();
  showToast('Usuario eliminado');
}

/* ============================================================
   FORMULARIOS PERSONALIZADOS
   ============================================================ */
function getCustomForms() { try { return JSON.parse(localStorage.getItem('custom_forms')) || []; } catch(e) { return []; } }
function saveCustomForms(f) { localStorage.setItem('custom_forms', JSON.stringify(f)); }

function renderCustomForms() {
  const list = document.getElementById('custom-forms-list');
  const forms = getCustomForms();
  list.innerHTML = forms.map(f => `
    <div class="admin-card">
      <div class="admin-card-info">
        <div class="admin-card-name">${f.icon||'📋'} ${f.name}</div>
        <div class="admin-card-sub">${f.fields?.length||0} campos</div>
      </div>
      <div class="admin-card-actions">
        <button class="btn-del" onclick="deleteCustomForm(${f.id})">🗑️</button>
      </div>
    </div>`).join('') || '<div class="history-empty">No hay formularios personalizados.<br>Usa + para crear uno.</div>';
}

function openFormBuilder() {
  document.getElementById('fb_name').value = '';
  document.getElementById('fb_icon').value = '📋';
  document.getElementById('fb_fields_list').innerHTML = '';
  addBuilderField();
  document.getElementById('modal-formbuilder').style.display = 'flex';
}
function closeFormBuilder() { document.getElementById('modal-formbuilder').style.display = 'none'; }

function addBuilderField() {
  const div = document.createElement('div');
  div.className = 'fb-field-row';
  div.innerHTML = `
    <input type="text" placeholder="Nombre del campo" class="fb-fname">
    <select class="fb-ftype">
      <option value="text">Texto</option>
      <option value="number">Número</option>
      <option value="date">Fecha</option>
      <option value="textarea">Texto largo</option>
    </select>
    <button class="fb-del" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('fb_fields_list').appendChild(div);
}

function saveCustomForm() {
  const name = document.getElementById('fb_name').value.trim();
  const icon = document.getElementById('fb_icon').value.trim() || '📋';
  if (!name) { showToast('⚠️ Escribe un nombre'); return; }
  const fields = [];
  document.querySelectorAll('.fb-field-row').forEach(row => {
    const fname = row.querySelector('.fb-fname').value.trim();
    if (fname) fields.push({ name: fname, type: row.querySelector('.fb-ftype').value });
  });
  if (!fields.length) { showToast('⚠️ Agrega al menos un campo'); return; }
  const forms = getCustomForms();
  forms.push({ id: Math.max(0, ...forms.map(f => f.id)) + 1, name, icon, fields, sheet: name.replace(/\s+/g,'_') });
  saveCustomForms(forms);
  closeFormBuilder();
  renderCustomForms();
  buildMenu();
  showToast('✅ Formulario creado');
}

function deleteCustomForm(id) {
  if (!confirm('¿Eliminar?')) return;
  saveCustomForms(getCustomForms().filter(f => f.id !== id));
  renderCustomForms(); buildMenu();
  showToast('Eliminado');
}

function sanitizeId(str) { return str.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); }

function showCustomForm(id) {
  const cf = getCustomForms().find(f => f.id === id);
  if (!cf) return;
  const viewId = 'view-custom-' + id;
  let v = document.getElementById(viewId);
  if (!v) {
    v = document.createElement('div');
    v.id = viewId; v.className = 'view';
    v.innerHTML = `<div class="form-scroll">
      <div class="form-section-header">
        <div class="section-icon">${cf.icon||'📋'}</div>
        <div><div class="section-title">${cf.name}</div><div class="section-sub">Formulario personalizado</div></div>
      </div>
      <div class="fields-grid">
        ${cf.fields.map(f => `<div class="field-group full">
          <label>${f.name} *</label>
          ${f.type==='textarea' ? `<textarea id="cf${id}_${sanitizeId(f.name)}" rows="3" placeholder="${f.name}"></textarea>`
          : `<input type="${f.type}" id="cf${id}_${sanitizeId(f.name)}" placeholder="${f.name}" inputmode="${f.type==='number'?'numeric':'text'}">`}
        </div>`).join('')}
        <div class="field-group"><label>Fecha *</label><input type="date" id="cf${id}_fecha" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="field-group full"><label>Levantado por *</label><input type="text" id="cf${id}_levantado" value="${currentUser?.nombre||''}"></div>
      </div>
      <button class="btn-submit" onclick="submitCustomForm(${id})">💾 Guardar registro</button>
    </div>`;
    document.getElementById('app-content').appendChild(v);
  }
  document.querySelectorAll('#app-content .view').forEach(x => x.classList.remove('active'));
  v.classList.add('active');
  document.getElementById('header-title').textContent = cf.name;
}

function submitCustomForm(id) {
  const cf = getCustomForms().find(f => f.id === id);
  if (!cf) return;
  const data = { formId:'cf_'+id, formName:cf.name, sheet:cf.sheet, userId:currentUser.id, userName:currentUser.nombre, status:'pending', fecha:new Date().toISOString(), localId:Date.now() };
  let valid = true;
  cf.fields.forEach(f => {
    const el = document.getElementById(`cf${id}_${sanitizeId(f.name)}`);
    const val = el ? el.value.trim() : '';
    if (!val) { if (el) el.classList.add('error'); valid = false; } else { if (el) el.classList.remove('error'); }
    data[sanitizeId(f.name)] = val;
  });
  if (!valid) { showToast('⚠️ Completa todos los campos'); return; }
  data.fecha_registro = document.getElementById(`cf${id}_fecha`)?.value || '';
  data.levantado = document.getElementById(`cf${id}_levantado`)?.value || '';
  const cache = JSON.parse(localStorage.getItem('registros_cache') || '[]');
  cache.push(data);
  localStorage.setItem('registros_cache', JSON.stringify(cache));
  showOkModal('✅ Registro guardado', 'Guardado localmente. Se sincronizará al conectarse.');
  updatePending();
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
   UI HELPERS
   ============================================================ */
function showToast(msg, ms=3500) {
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
   INIT
   ============================================================ */
function init() {
  updateOnlineStatus();
  if (restoreSession()) {
    startApp();
  } else {
    document.getElementById('screen-login').style.display = 'flex';
    document.getElementById('screen-app').style.display = 'none';
  }
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-user')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
