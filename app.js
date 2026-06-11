/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const CFG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec'
};

/* ============================================================
   INDEXEDDB — almacenamiento de fotos offline
   ============================================================ */
let fotoDB = null;

function abrirFotoDB() {
  return new Promise(function(resolve) {
    if (fotoDB) { resolve(fotoDB); return; }
    const req = indexedDB.open('FotosDB', 1);
    req.onupgradeneeded = function(e) {
      e.target.result.createObjectStore('fotos', { keyPath: 'localId' });
    };
    req.onsuccess = function(e) { fotoDB = e.target.result; resolve(fotoDB); };
    req.onerror = function() { resolve(null); };
  });
}

function guardarFotoLocal(localId, photoData) {
  return abrirFotoDB().then(function(db) {
    if (!db || !photoData) return;
    return new Promise(function(resolve) {
      const tx = db.transaction('fotos', 'readwrite');
      tx.objectStore('fotos').put({ localId: localId, photo_data: photoData });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  });
}

function obtenerFotoLocal(localId) {
  return abrirFotoDB().then(function(db) {
    if (!db) return null;
    return new Promise(function(resolve) {
      const tx = db.transaction('fotos', 'readonly');
      const req = tx.objectStore('fotos').get(localId);
      req.onsuccess = function() { resolve(req.result ? req.result.photo_data : null); };
      req.onerror = function() { resolve(null); };
    });
  });
}

function borrarFotoLocal(localId) {
  return abrirFotoDB().then(function(db) {
    if (!db) return;
    const tx = db.transaction('fotos', 'readwrite');
    tx.objectStore('fotos').delete(localId);
  });
}

const DEFAULT_USERS = [
  { id:1, nombre:'Administrador', usuario:'admin', pass:'admin123', rol:'admin',      forms:[1,2,3] },
  { id:2, nombre:'Supervisor',    usuario:'super', pass:'super123', rol:'supervisor',  forms:[1,2,3] },
  { id:3, nombre:'Empleado 1',    usuario:'emp1',  pass:'emp123',   rol:'empleado',    forms:[1] },
];

const FORMS = {
  1: { name:'Levantamiento de Contribuyentes', icon:'👤', sheet:'Contribuyentes' },
  2: { name:'Levantamiento de Datos',          icon:'📊', sheet:'Datos' },
  3: { name:'Levantamiento de Construccion',   icon:'🏗️', sheet:'Construccion' },
};

const REQUIRED = {
  1: ['f1_nombres','f1_apellidos','f1_cedula','f1_tel1','f1_sector','f1_calle','f1_poligono','f1_fecha','f1_levantado_por'],
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
  if (!u || !p) { err.textContent='⚠️ Ingresa usuario y contraseña.'; err.style.display='block'; return; }
  const found = getUsers().find(x => x.usuario===u && x.pass===p);
  if (!found) { err.textContent='❌ Usuario o contraseña incorrectos.'; err.style.display='block'; return; }
  err.style.display='none';
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
    const s = JSON.parse(localStorage.getItem('session'));
    if (!s) return false;
    const v = getUsers().find(x => x.id===s.id && x.pass===s.pass);
    if (v) { currentUser=v; return true; }
  } catch(e) {}
  return false;
}

function togglePass() {
  const i = document.getElementById('login-pass');
  i.type = i.type==='password' ? 'text' : 'password';
}

/* ============================================================
   INICIAR APP
   ============================================================ */
function startApp() {
  document.getElementById('screen-login').style.display = 'none';
  document.getElementById('screen-app').style.display   = 'block';
  document.getElementById('menu-name').textContent   = currentUser.nombre;
  document.getElementById('menu-role').textContent   = rolLabel(currentUser.rol);
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
  return {admin:'Administrador',supervisor:'Supervisor',empleado:'Empleado'}[r] || r;
}

/* ============================================================
   MENÚ
   ============================================================ */
function buildMenu() {
  const u = currentUser;
  let html = '';
  html += mSec('Formularios');
  u.forms.forEach(fid => {
    const f=FORMS[fid];
    if(f && fid !== '4n') html+=mLink(f.icon,f.name,`goForm(${fid})`);
  });
  getCustomForms().forEach(cf => { html+=mLink(cf.icon||'📋',cf.name,`showCustomForm(${cf.id})`); });
  html += mSec('Mis datos');
  html += mLink('📋','Mis registros',`goView('history')`);
  if (u.rol==='admin'||u.rol==='supervisor') {
    html += mSec('Reportes');
    html += mLink('📈','Ver reportes',`goView('reports')`);
    html += mLink('🔍','Consulta de datos',`goView('consulta')`);
  }
  if (u.rol==='admin') {
    html += mSec('Administración');
    html += mLink('👥','Gestionar usuarios',`goView('admin-users')`);
    html += mLink('🗂️','Gestionar formularios',`goView('admin-forms')`);
    html += mLink('📡','Rastreo GPS',`goView('rastreo')`);
  }
  document.getElementById('menu-links').innerHTML = html;
}

function mSec(t) { return `<div class="menu-section">${t}</div>`; }
function mLink(icon,label,action) {
  return `<button class="menu-link" onclick="${action};closeMenu()"><span class="ml-icon">${icon}</span>${label}</button>`;
}

function goForm(fid) {
  showView('form'+fid); closeMenu();
  // Si es el formulario de cementerio, inicializar con 1 nicho
  if (fid === 4) {
    const container = document.getElementById('difuntos-container');
    if (container && container.children.length === 0) {
      agregarDifunto();
    }
  }
}
function goView(name) {
  showView(name); closeMenu();
  if (name==='history')     renderHistory();
  if (name==='reports')     renderReports();
  if (name==='admin-users') renderUsers();
  if (name==='admin-forms') renderCustomForms();
  if (name==='consulta')    initConsulta();
  if (name==='rastreo')     renderEmpleadosActivos();
}

function buildHomeCards() {
  const u = currentUser;
  let html = '';
  u.forms.forEach(fid => {
    const f = FORMS[fid]; if(!f) return;
    html += `<div class="home-card" onclick="showView('form${fid}')"><div class="home-card-icon">${f.icon}</div><div class="home-card-name">${f.name}</div></div>`;
  });
  if (u.rol==='admin'||u.rol==='supervisor') {
    html += `<div class="home-card" onclick="goView('reports')"><div class="home-card-icon">📈</div><div class="home-card-name">Reportes</div></div>`;
    html += `<div class="home-card" onclick="goView('consulta')"><div class="home-card-icon">🔍</div><div class="home-card-name">Consulta</div></div>`;
  }
  if (u.rol==='admin') {
    html += `<div class="home-card" onclick="goView('admin-users')"><div class="home-card-icon">👥</div><div class="home-card-name">Usuarios</div></div>`;
    html += `<div class="home-card" onclick="goView('admin-forms')"><div class="home-card-icon">🗂️</div><div class="home-card-name">Formularios</div></div>`;
    html += `<div class="home-card" onclick="goView('rastreo')"><div class="home-card-icon">📡</div><div class="home-card-name">Rastreo GPS</div></div>`;
  }
  document.getElementById('home-cards').innerHTML = html;
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function showView(name) {
  document.querySelectorAll('#app-content .view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('view-'+name);
  if (v) { v.classList.add('active'); v.scrollTop=0; }
  const titles = {
    home:'Inicio', form1:'Contribuyentes', form2:'Levantamiento de Datos',
    form3:'Construcción', history:'Mis registros', reports:'Reportes',
    consulta:'Consulta de Datos', rastreo:'Rastreo GPS',
    'admin-users':'Usuarios', 'admin-forms':'Formularios', detalle:'Detalle'
  };
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
   GPS — siempre punto decimal, nunca coma
   ============================================================ */
function getGPS(prefix) {
  const el = document.getElementById(prefix+'_gps_coords');
  el.textContent = '📡 Obteniendo ubicación...';
  if (!navigator.geolocation) { el.textContent='GPS no disponible'; return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude.toFixed(6);
      var lng = pos.coords.longitude.toFixed(6);
      document.getElementById(prefix+'_lat').value = lat;
      document.getElementById(prefix+'_lng').value = lng;
      // Guardar enlace de Google Maps en campo oculto
      var mapsUrl = 'https://maps.google.com/?q=' + lat + ',' + lng;
      var mapsEl = document.getElementById(prefix+'_maps_url');
      if (mapsEl) mapsEl.value = mapsUrl;
      // Mostrar coordenadas + enlace clickeable
      el.innerHTML = '✅ ' + lat + ', ' + lng +
        ' <a href="' + mapsUrl + '" target="_blank" style="color:#0077b6;font-weight:700;text-decoration:underline;">Ver en Maps</a>';
    },
    function() { el.textContent='❌ No se pudo obtener la ubicación'; },
    { enableHighAccuracy:true, timeout:15000 }
  );
}

/* ============================================================
   FOTOS
   ============================================================ */
function takePhoto(p) { document.getElementById(p+'_camera_input').click(); }
function pickPhoto(p) { document.getElementById(p+'_photo_input').click(); }
function handlePhoto(p, input) {
  const file = input.files[0];
  if (!file) return;
  // Reducir tamaño de la foto antes de guardar
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
      if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; }
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const compressed = canvas.toDataURL('image/jpeg', 0.7);
      document.getElementById(p+'_photo_data').value = compressed;
      const prev = document.getElementById(p+'_photo_preview');
      const ph   = document.getElementById(p+'_photo_ph');
      prev.src=compressed; prev.style.display='block';
      if (ph) ph.style.display='none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   FOTO DE NICHO — manejo especial
   ============================================================ */
function handleNichoPhoto(idx, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
      if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; }
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const compressed = canvas.toDataURL('image/jpeg', 0.7);
      // Guardar en el campo oculto del nicho
      const photoField = document.getElementById('nicho-photo-'+idx);
      if (photoField) photoField.value = compressed;
      // Guardar en nichosData
      setNichoVal(idx, 'foto', compressed);
      // Mostrar preview
      const prev = document.getElementById('nicho-photo-preview-'+idx);
      const ph = document.getElementById('nicho-photo-ph-'+idx);
      if (prev) { prev.src=compressed; prev.style.display='block'; }
      if (ph) ph.style.display='none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   TOGGLE
   ============================================================ */
function setToggle(fieldId, val, btn) {
  document.getElementById(fieldId).value = val;
  btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (fieldId==='f1_publicidad') {
    const pub = document.getElementById('f1_pub_fields');
    if (pub) pub.style.display = val==='Sí' ? 'block' : 'none';
  }
}

/* ============================================================
   HELPERS
   ============================================================ */
function setTodayDates() {
  const today = new Date().toISOString().split('T')[0];
  ['f1_fecha','f2_fecha','f3_fecha'].forEach(id => { const el=document.getElementById(id); if(el) el.value=today; });
}
function prefillLevantadoPor() {
  ['f1_levantado_por','f2_levantado_por','f3_levantado_por'].forEach(id => {
    const el=document.getElementById(id); if(el&&currentUser) el.value=currentUser.nombre;
  });
}

/* ============================================================
   SUBMIT — versión simple y robusta
   ============================================================ */
function submitForm(formId) {
  const btn = document.querySelector('#view-form'+formId+' .btn-submit');
  if (btn && btn.classList.contains('processing')) return;

  // Validar
  const required = REQUIRED[formId];
  let valid = true, firstErr = null;
  document.querySelectorAll('#view-form'+formId+' .error').forEach(el => el.classList.remove('error'));
  required.forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.value.trim()) { el.classList.add('error'); valid=false; if(!firstErr) firstErr=el; }
  });
  if (!valid) {
    showToast('⚠️ Completa los campos marcados en rojo');
    if (firstErr) firstErr.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }

  // Bloquear botón
  if (btn) { btn.classList.add('processing'); btn.textContent='✅ Guardando...'; btn.style.opacity='0.7'; }

  // Recopilar datos
  const prefix = 'f'+formId+'_';
  const data = {
    formId:formId, sheet:FORMS[formId].sheet, formName:FORMS[formId].name,
    userId:currentUser.id, userName:currentUser.nombre,
    status:'pending', fecha:new Date().toISOString(), localId:Date.now()
  };
  document.querySelectorAll('#view-form'+formId+' input, #view-form'+formId+' select, #view-form'+formId+' textarea').forEach(function(el) {
    if (!el.id || el.type==='file') return;
    data[el.id.replace(prefix,'')] = el.value || '';
  });

  const photoData = data.photo_data || '';

  // Guardar datos en localStorage SIN foto
  try {
    const localData = Object.assign({}, data);
    delete localData.photo_data;
    localData.tiene_foto = photoData ? 'Si' : 'No';
    const cache = JSON.parse(localStorage.getItem('registros_cache')||'[]');
    cache.push(localData);
    localStorage.setItem('registros_cache', JSON.stringify(cache));
  } catch(e) { console.warn('localStorage:', e); }

  // Guardar foto en IndexedDB (mucho más capacidad que localStorage)
  if (photoData) {
    guardarFotoLocal(data.localId, photoData);
  }

  // Liberar botón y mostrar éxito INMEDIATAMENTE
  if (btn) { btn.classList.remove('processing'); btn.textContent='💾 Guardar registro'; btn.style.opacity='1'; }
  resetForm(formId);
  updatePending();
  showOkModal('✅ Registro guardado', isOnline
    ? 'Guardado. Enviando a Google Sheets en segundo plano...'
    : 'Sin internet. La foto y los datos se enviarán al conectarse.');

  // Enviar al servidor en segundo plano
  if (isOnline) {
    data.photo_data = photoData;
    window.setTimeout(function() {
      sendToSheets(data)
        .then(function() {
          updateCacheStatus(data.localId, 'synced');
          borrarFotoLocal(data.localId); // liberar espacio
        })
        .catch(function() {});
    }, 800);
  }
}

function updateCacheStatus(localId, status) {
  try {
    const cache = JSON.parse(localStorage.getItem('registros_cache')||'[]');
    const idx = cache.findIndex(r => r.localId===localId);
    if (idx>=0) { cache[idx].status=status; localStorage.setItem('registros_cache',JSON.stringify(cache)); }
  } catch(e) {}
}

function resetForm(formId) {
  document.querySelectorAll('#view-form'+formId+' input, #view-form'+formId+' select, #view-form'+formId+' textarea').forEach(function(el) {
    if (el.type==='file') return;
    el.value=''; el.classList.remove('error');
  });
  const prev = document.getElementById('f'+formId+'_photo_preview');
  if (prev) { prev.style.display='none'; prev.src=''; }
  const ph = document.getElementById('f'+formId+'_photo_ph');
  if (ph) ph.style.display='flex';
  const gps = document.getElementById('f'+formId+'_gps_coords');
  if (gps) gps.textContent='Sin ubicación capturada';
  if (formId===1) {
    const tog=document.getElementById('f1_publicidad_toggle');
    if (tog) { tog.querySelectorAll('.toggle-btn').forEach((b,i)=>b.classList.toggle('active',i===0)); }
    const pub=document.getElementById('f1_publicidad'); if(pub) pub.value='No';
    const pubf=document.getElementById('f1_pub_fields'); if(pubf) pubf.style.display='none';
  }
  setTodayDates(); prefillLevantadoPor();
}

/* ============================================================
   ENVIAR A SHEETS
   ============================================================ */
async function sendToSheets(data) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 25000);
  try {
    await fetch(CFG.SCRIPT_URL, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data),
      signal:ctrl.signal
    });
  } finally { clearTimeout(t); }
}

async function syncAll() {
  if (!isOnline) { showToast('Sin conexión'); return; }
  let cache = [];
  try { cache = JSON.parse(localStorage.getItem('registros_cache')||'[]'); } catch(e) {}
  const pending = cache.filter(r => r.status === 'pending');
  if (!pending.length) { showToast('✅ Todo sincronizado'); return; }
  showToast('⏳ Sincronizando '+pending.length+' registro(s)...');
  let ok = 0;
  for (const r of pending) {
    try {
      // Recuperar foto guardada offline en IndexedDB
      const photoData = await obtenerFotoLocal(r.localId);
      const dataConFoto = Object.assign({}, r);
      if (photoData) dataConFoto.photo_data = photoData;

      await sendToSheets(dataConFoto);
      updateCacheStatus(r.localId, 'synced');
      if (photoData) borrarFotoLocal(r.localId); // liberar espacio
      ok++;
    } catch(e) {}
  }
  showToast('✅ '+ok+' de '+pending.length+' sincronizados');
  updatePending();
}

function updatePending() {
  try {
    const cache = JSON.parse(localStorage.getItem('registros_cache')||'[]');
    const n = cache.filter(r=>r.status==='pending').length;
    const banner=document.getElementById('pending-banner');
    if (banner) banner.style.display=n>0?'flex':'none';
    const el=document.getElementById('pending-num');
    if (el) el.textContent=n;
  } catch(e) {}
}

/* ============================================================
   HISTORIAL
   ============================================================ */
function renderHistory() {
  const fFilter=document.getElementById('history-filter')?.value||'';
  const sFilter=document.getElementById('history-status')?.value||'';
  const list=document.getElementById('history-list');
  let cache=[];
  try { cache=JSON.parse(localStorage.getItem('registros_cache')||'[]'); } catch(e) {}
  if (currentUser.rol==='empleado') cache=cache.filter(r=>r.userId===currentUser.id);
  if (fFilter) cache=cache.filter(r=>String(r.formId)===fFilter);
  if (sFilter) cache=cache.filter(r=>r.status===sFilter);
  cache=[...cache].reverse();
  if (!cache.length) { list.innerHTML='<div class="history-empty">📭 No hay registros.</div>'; return; }
  list.innerHTML=cache.map(r=>{
    const f=FORMS[r.formId]||{icon:'📋',name:r.formName||'Formulario'};
    const sc={pending:'s-pending',synced:'s-synced',error:'s-error'}[r.status]||'s-pending';
    const sl={pending:'Pendiente',synced:'Sincronizado',error:'Error'}[r.status]||r.status;
    const date=r.fecha?new Date(r.fecha).toLocaleString('es-DO'):'—';
    return `<div class="h-card">
      <div class="h-card-top"><div class="h-card-name">${f.icon} ${f.name}</div><span class="status-pill ${sc}">${sl}</span></div>
      <div class="h-card-meta"><span>👤 ${r.nombres||r.nombre||'—'}</span><span>📅 ${date}</span><span>📌 Polígono: ${r.poligono||'—'}</span></div>
    </div>`;
  }).join('');
}

/* ============================================================
   REPORTES
   ============================================================ */
function renderReports() {
  let cache=[];
  try { cache=JSON.parse(localStorage.getItem('registros_cache')||'[]'); } catch(e) {}
  const total=cache.length, pending=cache.filter(r=>r.status==='pending').length, synced=cache.filter(r=>r.status==='synced').length;
  document.getElementById('report-cards').innerHTML=`
    <div class="report-stat"><div class="rs-num">${total}</div><div class="rs-label">Total</div></div>
    <div class="report-stat"><div class="rs-num" style="color:var(--warning)">${pending}</div><div class="rs-label">Pendientes</div></div>
    <div class="report-stat"><div class="rs-num" style="color:var(--success)">${synced}</div><div class="rs-label">Sincronizados</div></div>`;
  const rows=[...cache].reverse().slice(0,30).map(r=>{
    const f=FORMS[r.formId]||{name:r.formName||'—'};
    const date=r.fecha?new Date(r.fecha).toLocaleString('es-DO'):'—';
    const sc={pending:'s-pending',synced:'s-synced'}[r.status]||'';
    const sl={pending:'Pendiente',synced:'Sync'}[r.status]||r.status;
    return `<tr><td>${f.name}</td><td>${r.nombres||r.nombre||'—'}</td><td>${r.userName||'—'}</td><td>${date}</td><td><span class="status-pill ${sc}">${sl}</span></td></tr>`;
  }).join('');
  document.getElementById('report-table-wrap').innerHTML=`
    <table class="report-table">
      <thead><tr><th>Formulario</th><th>Nombre</th><th>Usuario</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Sin registros</td></tr>'}</tbody>
    </table>`;
}

/* ============================================================
   ADMIN USUARIOS
   ============================================================ */
function renderUsers() {
  document.getElementById('users-list').innerHTML=getUsers().map(u=>`
    <div class="admin-card">
      <div class="admin-card-info"><div class="admin-card-name">${u.nombre}</div><div class="admin-card-sub">@${u.usuario} · ${rolLabel(u.rol)} · Forms: ${u.forms.join(', ')}</div></div>
      <div class="admin-card-actions">
        <button class="btn-edit" onclick="openUserModal(${u.id})">✏️</button>
        ${u.id!==currentUser.id?`<button class="btn-del" onclick="deleteUser(${u.id})">🗑️</button>`:''}
      </div>
    </div>`).join('')||'<div class="history-empty">Sin usuarios.</div>';
}

function openUserModal(id) {
  ['mu_nombre','mu_user','mu_pass'].forEach(x=>document.getElementById(x).value='');
  document.getElementById('mu_rol').value='empleado';
  document.getElementById('mu_edit_id').value='';
  document.querySelectorAll('#mu_perms input[type=checkbox]').forEach(cb=>cb.checked=false);
  document.getElementById('modal-user-title').textContent=id?'Editar Usuario':'Nuevo Usuario';
  if (id) {
    const u=getUsers().find(x=>x.id===id); if(!u) return;
    document.getElementById('mu_nombre').value=u.nombre;
    document.getElementById('mu_user').value=u.usuario;
    document.getElementById('mu_pass').value=u.pass;
    document.getElementById('mu_rol').value=u.rol;
    document.getElementById('mu_edit_id').value=u.id;
    document.querySelectorAll('#mu_perms input[type=checkbox]').forEach(cb=>{cb.checked=u.forms.includes(Number(cb.value));});
  }
  document.getElementById('modal-user').style.display='flex';
}
function closeUserModal() { document.getElementById('modal-user').style.display='none'; }
function saveUser() {
  const nombre=document.getElementById('mu_nombre').value.trim();
  const usuario=document.getElementById('mu_user').value.trim();
  const pass=document.getElementById('mu_pass').value.trim();
  const rol=document.getElementById('mu_rol').value;
  const editId=document.getElementById('mu_edit_id').value;
  const forms=[...document.querySelectorAll('#mu_perms input[type=checkbox]:checked')].map(cb=>Number(cb.value));
  if (!nombre||!usuario||!pass) { showToast('⚠️ Completa todos los campos'); return; }
  const users=getUsers();
  if (editId) { const idx=users.findIndex(u=>u.id===Number(editId)); if(idx>=0) users[idx]={...users[idx],nombre,usuario,pass,rol,forms}; }
  else users.push({id:Math.max(0,...users.map(u=>u.id))+1,nombre,usuario,pass,rol,forms});
  saveUsers(users); closeUserModal(); renderUsers(); showToast('✅ Usuario guardado');
}
function deleteUser(id) {
  if (!confirm('¿Eliminar?')) return;
  saveUsers(getUsers().filter(u=>u.id!==id)); renderUsers(); showToast('Eliminado');
}

/* ============================================================
   FORMULARIOS PERSONALIZADOS
   ============================================================ */
function getCustomForms() { try { return JSON.parse(localStorage.getItem('custom_forms'))||[]; } catch(e) { return []; } }
function saveCustomForms(f) { localStorage.setItem('custom_forms',JSON.stringify(f)); }
function sanitizeId(s) { return s.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); }

function renderCustomForms() {
  const forms=getCustomForms();
  document.getElementById('custom-forms-list').innerHTML=forms.map(f=>`
    <div class="admin-card">
      <div class="admin-card-info"><div class="admin-card-name">${f.icon||'📋'} ${f.name}</div><div class="admin-card-sub">${f.fields?.length||0} campos</div></div>
      <div class="admin-card-actions"><button class="btn-del" onclick="deleteCustomForm(${f.id})">🗑️</button></div>
    </div>`).join('')||'<div class="history-empty">No hay formularios personalizados.</div>';
}
function openFormBuilder() {
  document.getElementById('fb_name').value=''; document.getElementById('fb_icon').value='📋';
  document.getElementById('fb_fields_list').innerHTML=''; addBuilderField();
  document.getElementById('modal-formbuilder').style.display='flex';
}
function closeFormBuilder() { document.getElementById('modal-formbuilder').style.display='none'; }
function addBuilderField() {
  const div=document.createElement('div'); div.className='fb-field-row';
  div.innerHTML=`<input type="text" placeholder="Nombre del campo" class="fb-fname">
    <select class="fb-ftype"><option value="text">Texto</option><option value="number">Número</option><option value="date">Fecha</option><option value="textarea">Texto largo</option></select>
    <button class="fb-del" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('fb_fields_list').appendChild(div);
}
function saveCustomForm() {
  const name=document.getElementById('fb_name').value.trim();
  const icon=document.getElementById('fb_icon').value.trim()||'📋';
  if (!name) { showToast('⚠️ Escribe un nombre'); return; }
  const fields=[]; document.querySelectorAll('.fb-field-row').forEach(row=>{
    const fn=row.querySelector('.fb-fname').value.trim();
    if (fn) fields.push({name:fn,type:row.querySelector('.fb-ftype').value});
  });
  if (!fields.length) { showToast('⚠️ Agrega al menos un campo'); return; }
  const forms=getCustomForms();
  forms.push({id:Math.max(0,...forms.map(f=>f.id))+1,name,icon,fields,sheet:name.replace(/\s+/g,'_')});
  saveCustomForms(forms); closeFormBuilder(); renderCustomForms(); buildMenu(); showToast('✅ Formulario creado');
}
function deleteCustomForm(id) {
  if (!confirm('¿Eliminar?')) return;
  saveCustomForms(getCustomForms().filter(f=>f.id!==id)); renderCustomForms(); buildMenu(); showToast('Eliminado');
}
function showCustomForm(id) {
  const cf=getCustomForms().find(f=>f.id===id); if(!cf) return;
  const viewId='view-custom-'+id;
  let v=document.getElementById(viewId);
  if (!v) {
    v=document.createElement('div'); v.id=viewId; v.className='view';
    v.innerHTML=`<div class="form-scroll">
      <div class="form-section-header"><div class="section-icon">${cf.icon||'📋'}</div><div><div class="section-title">${cf.name}</div></div></div>
      <div class="fields-grid">
        ${cf.fields.map(f=>`<div class="field-group full"><label>${f.name} *</label>
          ${f.type==='textarea'?`<textarea id="cf${id}_${sanitizeId(f.name)}" rows="3"></textarea>`
          :`<input type="${f.type}" id="cf${id}_${sanitizeId(f.name)}" placeholder="${f.name}">`}
        </div>`).join('')}
        <div class="field-group"><label>Fecha *</label><input type="date" id="cf${id}_fecha" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="field-group full"><label>Levantado por *</label><input type="text" id="cf${id}_levantado" value="${currentUser?.nombre||''}"></div>
      </div>
      <button class="btn-submit" onclick="submitCustomForm(${id})">💾 Guardar registro</button>
    </div>`;
    document.getElementById('app-content').appendChild(v);
  }
  document.querySelectorAll('#app-content .view').forEach(x=>x.classList.remove('active'));
  v.classList.add('active');
  document.getElementById('header-title').textContent=cf.name;
}
function submitCustomForm(id) {
  const cf=getCustomForms().find(f=>f.id===id); if(!cf) return;
  const data={formId:'cf_'+id,formName:cf.name,sheet:cf.sheet,userId:currentUser.id,userName:currentUser.nombre,status:'pending',fecha:new Date().toISOString(),localId:Date.now()};
  let valid=true;
  cf.fields.forEach(f=>{ const el=document.getElementById(`cf${id}_${sanitizeId(f.name)}`); const val=el?el.value.trim():''; if(!val){if(el)el.classList.add('error');valid=false;}else{if(el)el.classList.remove('error');} data[sanitizeId(f.name)]=val; });
  if (!valid) { showToast('⚠️ Completa todos los campos'); return; }
  data.fecha_registro=document.getElementById(`cf${id}_fecha`)?.value||'';
  data.levantado=document.getElementById(`cf${id}_levantado`)?.value||'';
  try { const cache=JSON.parse(localStorage.getItem('registros_cache')||'[]'); cache.push(data); localStorage.setItem('registros_cache',JSON.stringify(cache)); } catch(e) {}
  showOkModal('✅ Registro guardado','Guardado localmente. Se sincronizará al conectarse.'); updatePending();
}

/* ============================================================
   RASTREO GPS
   ============================================================ */
let rastreoActivo=false, rastreoWatchId=null, puntosRuta=[];

function toggleRastreo() { rastreoActivo ? detenerRastreo() : iniciarRastreo(); }
function iniciarRastreo() {
  if (!navigator.geolocation) { showToast('GPS no disponible'); return; }
  rastreoActivo=true;
  document.getElementById('rastreo-dot').className='rastreo-dot active';
  document.getElementById('rastreo-label').textContent='Rastreando...';
  document.getElementById('btn-rastreo').textContent='⏹ Detener';
  document.getElementById('btn-rastreo').className='btn-rastreo stop';
  rastreoWatchId=navigator.geolocation.watchPosition(
    function(pos) {
      var lat=pos.coords.latitude.toFixed(6);
      var lng=pos.coords.longitude.toFixed(6);
      var prec=Math.round(pos.coords.accuracy);
      var ahora=new Date();
      document.getElementById('rs-lat').textContent=lat;
      document.getElementById('rs-lng').textContent=lng;
      document.getElementById('rs-precision').textContent=prec+' m';
      document.getElementById('rs-tiempo').textContent=ahora.toLocaleTimeString('es-DO');
      puntosRuta.push({lat:parseFloat(lat),lng:parseFloat(lng),precision:prec,hora:ahora.toISOString(),userId:currentUser.id,userName:currentUser.nombre});
      actualizarMapa(lat,lng); renderHistorialPuntos();
    },
    function() { showToast('Error de GPS'); },
    {enableHighAccuracy:true,maximumAge:10000,timeout:15000}
  );
}
function detenerRastreo() {
  if (rastreoWatchId!==null) { navigator.geolocation.clearWatch(rastreoWatchId); rastreoWatchId=null; }
  rastreoActivo=false;
  document.getElementById('rastreo-dot').className='rastreo-dot paused';
  document.getElementById('rastreo-label').textContent='Detenido · '+puntosRuta.length+' puntos';
  document.getElementById('btn-rastreo').textContent='▶ Reanudar';
  document.getElementById('btn-rastreo').className='btn-rastreo';
}
let mapaInit=false;
function actualizarMapa(lat,lng) {
  const iframe=document.getElementById('map-iframe');
  const ph=document.getElementById('map-placeholder');
  const url='https://www.openstreetmap.org/export/embed.html?bbox='+(parseFloat(lng)-0.003)+','+(parseFloat(lat)-0.003)+','+(parseFloat(lng)+0.003)+','+(parseFloat(lat)+0.003)+'&layer=mapnik&marker='+lat+','+lng;
  if (!mapaInit) { ph.style.display='none'; iframe.style.display='block'; mapaInit=true; }
  iframe.src=url;
}
function renderHistorialPuntos() {
  const c=document.getElementById('rastreo-historial');
  if (!puntosRuta.length) { c.innerHTML='<div class="history-empty">Sin puntos.</div>'; return; }
  c.innerHTML=[...puntosRuta].reverse().slice(0,10).map(p=>`
    <div class="punto-card"><div><div class="punto-coords">📍 ${p.lat}, ${p.lng}</div><div class="punto-time">Precisión: ${p.precision}m</div></div>
    <div class="punto-time">${new Date(p.hora).toLocaleTimeString('es-DO')}</div></div>`).join('');
}
function renderEmpleadosActivos() {}

/* ============================================================
   CONSULTA
   ============================================================ */
let consultaResultados=[], vistaConsulta='lista';
function initConsulta() {
  const sel=document.getElementById('consulta-usuario');
  if (sel) { sel.innerHTML='<option value="">Todos los usuarios</option>'; getUsers().forEach(u=>{ sel.innerHTML+=`<option value="${u.id}">${u.nombre}</option>`; }); }
  filtrarConsulta();
}
function filtrarConsulta() {
  const busq=(document.getElementById('consulta-search')?.value||'').toLowerCase();
  const ff=document.getElementById('consulta-form')?.value||'';
  const pf=document.getElementById('consulta-poligono')?.value||'';
  const uf=document.getElementById('consulta-usuario')?.value||'';
  const fi=document.getElementById('consulta-fecha-ini')?.value||'';
  const fft=document.getElementById('consulta-fecha-fin')?.value||'';
  let cache=[]; try { cache=JSON.parse(localStorage.getItem('registros_cache')||'[]'); } catch(e) {}
  if (ff) cache=cache.filter(r=>String(r.formId)===ff);
  if (pf) cache=cache.filter(r=>r.poligono===pf);
  if (uf) cache=cache.filter(r=>String(r.userId)===uf);
  if (fi) cache=cache.filter(r=>r.fecha&&r.fecha.split('T')[0]>=fi);
  if (fft) cache=cache.filter(r=>r.fecha&&r.fecha.split('T')[0]<=fft);
  if (busq) cache=cache.filter(r=>[r.nombres,r.apellidos,r.nombre,r.cedula,r.rmc,r.userName].join(' ').toLowerCase().includes(busq));
  consultaResultados=[...cache].reverse();
  renderConsultaStats(); renderConsultaLista();
}
function renderConsultaStats() {
  const t=consultaResultados.length;
  document.getElementById('consulta-stats').innerHTML=`<div class="cstat">Total: ${t}</div>`;
}
function renderConsultaLista() {
  const lista=document.getElementById('consulta-lista');
  if (!consultaResultados.length) { lista.innerHTML='<div class="history-empty">📭 Sin registros.</div>'; return; }
  lista.innerHTML=consultaResultados.map((r,i)=>{
    const f=FORMS[r.formId]||{icon:'📋',name:r.formName||'Formulario'};
    const nombre=r.nombres?`${r.nombres} ${r.apellidos||''}`.trim():(r.nombre||'—');
    const fecha=r.fecha?new Date(r.fecha).toLocaleDateString('es-DO'):'—';
    return `<div class="consulta-card" onclick="verDetalle(${i})">
      <div class="consulta-card-top"><div class="consulta-card-name">${f.icon} ${nombre}</div><span style="font-size:11px;color:var(--muted)">${fecha}</span></div>
      <div class="consulta-card-badges">
        <span class="badge badge-form">${f.name}</span>
        ${r.poligono?`<span class="badge badge-poli">Polígono ${r.poligono}</span>`:''}
        <span class="badge badge-user">👤 ${r.userName||'—'}</span>
      </div>
    </div>`;
  }).join('');
}
function setConsultaView(tipo,btn) {
  vistaConsulta=tipo;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  document.getElementById('consulta-lista').style.display=tipo==='lista'?'flex':'none';
  document.getElementById('consulta-mapa').style.display=tipo==='mapa'?'block':'none';
  if (tipo==='mapa') renderConsultaMapa();
}

function renderConsultaMapa() {
  const contenedor = document.getElementById('consulta-mapa');
  const registros = consultaResultados.filter(function(r) { return r.lat && r.lng; });

  if (!registros.length) {
    contenedor.innerHTML = '<div class="history-empty">📭 No hay registros con GPS para mostrar.</div>';
    return;
  }

  // Crear div del mapa
  contenedor.innerHTML = '<div id="leaflet-map" style="width:100%;height:420px;border-radius:12px;margin:0 16px 16px;width:calc(100% - 32px);"></div>';

  function iniciarMapa() {
    const L = window.L;
    if (!L) { showToast('Error cargando el mapa'); return; }

    // Destruir mapa previo si existe
    const el = document.getElementById('leaflet-map');
    if (!el) return;
    if (el._leaflet_id) { el._leaflet_id = null; }

    const lats = registros.map(function(r) { return parseFloat(r.lat); });
    const lngs = registros.map(function(r) { return parseFloat(r.lng); });
    const centerLat = (Math.min.apply(null,lats) + Math.max.apply(null,lats)) / 2;
    const centerLng = (Math.min.apply(null,lngs) + Math.max.apply(null,lngs)) / 2;

    const map = L.map('leaflet-map').setView([centerLat, centerLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(map);

    // Marcador por cada registro
    registros.forEach(function(r) {
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lng);
      const nombre = r.nombres ? (r.nombres+' '+(r.apellidos||'')).trim() : (r.nombre||'Sin nombre');
      const form = FORMS[r.formId] ? FORMS[r.formId].name : (r.formName||'Formulario');
      const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-DO') : '—';
      const mapsUrl = 'https://maps.google.com/?q='+lat+','+lng;
      const popup =
        '<b>'+nombre+'</b><br>'+
        '<i>'+form+'</i><br>'+
        'Polígono: '+(r.poligono||'—')+'<br>'+
        'Fecha: '+fecha+'<br>'+
        '<a href="'+mapsUrl+'" target="_blank" style="color:#0077b6;font-weight:600;">📍 Ver en Google Maps</a>';
      L.marker([lat, lng]).addTo(map).bindPopup(popup);
    });

    // Ajustar zoom para ver todos los puntos
    if (registros.length > 1) {
      const bounds = L.latLngBounds(registros.map(function(r) { return [parseFloat(r.lat), parseFloat(r.lng)]; }));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  // Cargar Leaflet si no está disponible
  if (!window.L) {
    if (!document.getElementById('leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css'; css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = iniciarMapa;
    document.head.appendChild(script);
  } else {
    iniciarMapa();
  }
}
function limpiarFiltros() {
  ['consulta-search','consulta-fecha-ini','consulta-fecha-fin'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['consulta-form','consulta-poligono','consulta-usuario'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  filtrarConsulta();
}
function verDetalle(idx) {
  const r=consultaResultados[idx]; if(!r) return;
  const f=FORMS[r.formId]||{icon:'📋',name:r.formName||'Formulario'};
  const nombre=r.nombres?`${r.nombres} ${r.apellidos||''}`.trim():(r.nombre||'—');
  const fecha=r.fecha?new Date(r.fecha).toLocaleString('es-DO'):'—';
  const sc={pending:'s-pending',synced:'s-synced'}[r.status]||'s-pending';
  const sl={pending:'Pendiente',synced:'Sincronizado'}[r.status]||r.status;
  const campos=Object.entries(r).filter(([k])=>!['formId','formName','sheet','status','localId','photo_data','userId','tiene_foto'].includes(k));
  let html=`<div class="detalle-header"><div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><div class="detalle-title">${f.icon} ${nombre}</div><div class="detalle-sub">${f.name} · ${fecha}</div></div>
    <span class="status-pill ${sc}">${sl}</span></div></div>
    <div class="detalle-section"><div class="detalle-section-title">Datos del registro</div>
    <div class="detalle-grid">${campos.map(([k,v])=>v?`<div class="detalle-field ${String(v).length>30?'full':''}"><div class="detalle-field-label">${k}</div><div class="detalle-field-val">${v}</div></div>`:'').join('')}</div></div>
    <button class="btn-back-detalle" onclick="goView('consulta')">← Volver</button>`;
  document.getElementById('detalle-content').innerHTML=html;
  showView('detalle'); document.getElementById('header-title').textContent='Detalle';
}

/* ============================================================
   ONLINE / OFFLINE
   ============================================================ */
function updateOnlineStatus() {
  isOnline=navigator.onLine;
  const dot=document.getElementById('online-dot');
  if (dot) { dot.className='online-dot '+(isOnline?'online':'offline'); }
  if (isOnline) syncAll();
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

/* ============================================================
   UI HELPERS
   ============================================================ */
function showToast(msg,ms=3500) {
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),ms);
}
function showOkModal(title,msg) {
  document.getElementById('ok-title').textContent=title;
  document.getElementById('ok-msg').textContent=msg;
  document.getElementById('modal-ok').style.display='flex';
}
function closeOkModal() { document.getElementById('modal-ok').style.display='none'; showView('home'); }

/* ============================================================
   FORMULARIO 4 — CEMENTERIO + NICHOS UNIFICADO
   ============================================================ */
let nichosData = [];
let nichoContador = 0;

function incrementar(id, delta) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
}

function actualizarGeoreferencia4() {
  const cem    = document.getElementById('f4_cementerio')?.value || '';
  const sector = document.getElementById('f4_sector')?.value    || '';
  const manz   = document.getElementById('f4_manzana')?.value   || '';
  const lote   = document.getElementById('f4_num_lote')?.value  || '';
  const codigo = [cem, sector, manz, lote].filter(Boolean).join('-');
  const ref    = document.getElementById('f4_georeferencia');
  if (ref) ref.value = codigo;
  // Actualizar código en todos los nichos existentes
  nichosData.forEach(function(n) { actualizarCodigoNicho(n.idx); });
}

function actualizarContadorNichos() {
  const label = document.getElementById('nichos-count-label');
  const n = nichosData.length;
  if (label) label.textContent = n === 0 ? 'Sin nichos agregados' : n + ' nicho(s) agregado(s)';
}

function calcularCodigoNicho(georef, terminal, posicion) {
  return [georef, terminal, posicion].filter(Boolean).join('-');
}

function agregarNicho() {
  nichoContador++;
  const idx = nichoContador;
  const georef = document.getElementById('f4_georeferencia')?.value || '';
  nichosData.push({ idx:idx, estado:'', terminal:'', posicion:'', nombre:'', fecha_fallecimiento:'', observaciones:'' });
  const container = document.getElementById('nichos-container');
  const div = document.createElement('div');
  div.className = 'nicho-card';
  div.id = 'nicho-card-' + idx;
  const terminales = ['A','B','C','D','E','F','G','H','I','J','K'];
  div.innerHTML =
    '<div class="nicho-card-header">' +
      '<div><div class="nicho-card-title">⚰️ Nicho #' + idx + '</div>' +
      '<div class="nicho-card-num">Código: <span id="nicho-codigo-' + idx + '">—</span></div></div>' +
      '<button class="btn-remove-nicho" onclick="eliminarNicho(' + idx + ')">✕</button>' +
    '</div>' +
    '<div class="nicho-card-body">' +
      '<div class="nicho-codigo" id="nicho-codigo-box-' + idx + '">Código: —</div>' +
      '<div class="nicho-fields">' +
        '<div class="field-group full"><label>Estado del Nicho *</label>' +
          '<div class="toggle-group-wrap">' +
            '<button class="toggle-btn-sm" onclick="setNichoEstado(' + idx + ',this,&quot;OCUPADO&quot;)">OCUPADO</button>' +
            '<button class="toggle-btn-sm" onclick="setNichoEstado(' + idx + ',this,&quot;VACÍO&quot;)">VACÍO</button>' +
          '</div>' +
        '</div>' +
        '<div class="field-group full"><label>Terminal del Nicho *</label>' +
          '<div class="toggle-group-wrap">' +
            terminales.map(function(l) {
              return '<button class="toggle-btn-sm" onclick="setNichoTerminal(' + idx + ',this,&quot;' + l + '&quot;)">' + l + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="field-group"><label>Posición *</label>' +
          '<select id="nicho-posicion-' + idx + '" onchange="setNichoPosicion(' + idx + ',this.value)">' +
            '<option value="">Pos...</option>' +
            [1,2,3,4,5,6,7,8,9,10].map(function(n){return '<option>'+n+'</option>';}).join('') +
          '</select>' +
        '</div>' +
        '<div class="field-group"><label>Nombre del Difunto</label>' +
          '<input type="text" id="nicho-nombre-' + idx + '" placeholder="Nombre (dejar vacío si no hay)" oninput="setNichoNombre(' + idx + ',this.value)">' +
        '</div>' +
        '<div class="field-group"><label>Fecha de Fallecimiento</label>' +
          '<input type="date" id="nicho-fecha-' + idx + '" onchange="setNichoFecha(' + idx + ',this.value)">' +
        '</div>' +
        '<div class="field-group"><label>Edad al fallecer</label>' +
          '<input type="number" id="nicho-edad-' + idx + '" placeholder="Años" min="0" inputmode="numeric" oninput="setNichoEdad(' + idx + ',this.value)">' +
        '</div>' +
        '<div class="field-group full"><label>Foto del nicho</label>' +
          '<div class="photo-box">' +
            '<img id="nicho-photo-preview-' + idx + '" style="display:none;max-width:100%;max-height:160px;border-radius:8px;object-fit:cover;">' +
            '<div class="photo-placeholder" id="nicho-photo-ph-' + idx + '"><span>📷</span><span>Foto del nicho</span></div>' +
            '<div class="photo-btns">' +
              '<button class="btn-photo" onclick="takePhoto(\"nicho'+idx+'\")">📷 Cámara</button>' +
              '<button class="btn-photo" onclick="pickPhoto(\"nicho'+idx+'\")">🖼 Galería</button>' +
            '</div>' +
            '<input type="file" id="nicho'+idx+'_camera_input" accept="image/*" capture="environment" style="display:none" onchange="handleNichoPhoto(' + idx + ',this)">' +
            '<input type="file" id="nicho'+idx+'_photo_input" accept="image/*" style="display:none" onchange="handleNichoPhoto(' + idx + ',this)">' +
          '</div>' +
          '<input type="hidden" id="nicho-photo-' + idx + '">' +
        '</div>' +
        '<div class="field-group full"><label>Observaciones</label>' +
          '<textarea id="nicho-obs-' + idx + '" rows="2" placeholder="Observaciones..." oninput="setNichoObs(' + idx + ',this.value)"></textarea>' +
        '</div>' +
      '</div>' +
    '</div>';
  container.appendChild(div);
  actualizarContadorNichos();
  div.scrollIntoView({ behavior:'smooth', block:'start' });
}

function eliminarNicho(idx) {
  nichosData = nichosData.filter(function(n) { return n.idx !== idx; });
  const card = document.getElementById('nicho-card-' + idx);
  if (card) card.remove();
  actualizarContadorNichos();
}

function setNichoToggle(idx, campo, valor, btn) {
  setNichoVal(idx, campo, valor);
  btn.closest('.toggle-group-wrap').querySelectorAll('.toggle-btn-sm').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (campo === 'terminal') actualizarCodigoNicho(idx);
}

// Funciones helper para evitar comillas dentro de strings HTML
function setNichoEstado(idx, btn, valor) {
  setNichoVal(idx, 'estado', valor);
  btn.closest('.toggle-group-wrap').querySelectorAll('.toggle-btn-sm').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  // Si es VACÍO, poner VACÍO en nombre automáticamente
  const nombreEl = document.getElementById('nicho-nombre-'+idx);
  if (nombreEl && valor === 'VACÍO' && !nombreEl.value) nombreEl.value = 'VACÍO';
  if (nombreEl && valor === 'OCUPADO' && nombreEl.value === 'VACÍO') nombreEl.value = '';
}

function setNichoTerminal(idx, btn, valor) {
  setNichoVal(idx, 'terminal', valor);
  btn.closest('.toggle-group-wrap').querySelectorAll('.toggle-btn-sm').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  actualizarCodigoNicho(idx);
}

function setNichoPosicion(idx, valor) {
  setNichoVal(idx, 'posicion', valor);
  actualizarCodigoNicho(idx);
}

function setNichoNombre(idx, valor) { setNichoVal(idx, 'nombre', valor); }
function setNichoFecha(idx, valor)  { setNichoVal(idx, 'fecha_fallecimiento', valor); }
function setNichoEdad(idx, valor)   { setNichoVal(idx, 'edad', valor); }
function setNichoObs(idx, valor)    { setNichoVal(idx, 'observaciones', valor); }

function setNichoVal(idx, campo, valor) {
  const nicho = nichosData.find(function(n) { return n.idx === idx; });
  if (nicho) nicho[campo] = valor;
}

function actualizarCodigoNicho(idx) {
  const nicho = nichosData.find(function(n) { return n.idx === idx; });
  if (!nicho) return;
  const georef = document.getElementById('f4_georeferencia')?.value || '';
  const codigo = calcularCodigoNicho(georef, nicho.terminal, nicho.posicion);
  const display = document.getElementById('nicho-codigo-' + idx);
  const box = document.getElementById('nicho-codigo-box-' + idx);
  if (display) display.textContent = codigo || '—';
  if (box) box.textContent = 'Código: ' + (codigo || '—');
  nicho.codigo = codigo;
}

function submitFormCementerio() {
  const btn = document.querySelector('#view-form4 .btn-submit');
  if (btn && btn.classList.contains('processing')) return;

  // Validar bóveda
  const required = REQUIRED[4];
  let valid = true, firstErr = null;
  document.querySelectorAll('#view-form4 .error').forEach(function(el) { el.classList.remove('error'); });
  required.forEach(function(id) {
    const el = document.getElementById(id); if (!el) return;
    if (!el.value.trim()) { el.classList.add('error'); valid=false; if(!firstErr) firstErr=el; }
  });
  if (!valid) {
    showToast('⚠️ Completa los campos de la bóveda');
    if (firstErr) firstErr.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  if (nichosData.length === 0) { showToast('⚠️ Agrega al menos un nicho'); return; }
  let nichoValido = true;
  nichosData.forEach(function(n) { if (!n.estado || !n.terminal || !n.posicion) nichoValido=false; });
  if (!nichoValido) { showToast('⚠️ Completa Estado, Terminal y Posición en todos los nichos'); return; }

  if (btn) { btn.classList.add('processing'); btn.textContent='✅ Guardando...'; btn.style.opacity='0.7'; }

  // Datos base bóveda
  const dataBoveda = {
    cementerio:        document.getElementById('f4_cementerio')?.value || '',
    sector:            document.getElementById('f4_sector')?.value || '',
    manzana:           document.getElementById('f4_manzana')?.value || '',
    num_lote:          document.getElementById('f4_num_lote')?.value || '',
    georeferencia:     document.getElementById('f4_georeferencia')?.value || '',
    nombre_cementerio: document.getElementById('f4_nombre_cementerio')?.value || '',
    status_lote:       document.getElementById('f4_status_lote')?.value || '',
    nombre_boveda:     document.getElementById('f4_nombre_boveda')?.value || '',
    cant_nichos:       document.getElementById('f4_cant_nichos')?.value || '0',
    cant_niveles:      document.getElementById('f4_cant_niveles')?.value || '0',
    materiales:        document.getElementById('f4_materiales')?.value || '',
    condiciones:       document.getElementById('f4_condiciones')?.value || '',
    lat:               document.getElementById('f4_lat')?.value || '',
    lng:               document.getElementById('f4_lng')?.value || '',
    maps_url:          document.getElementById('f4_maps_url')?.value || '',
    fecha:             document.getElementById('f4_fecha')?.value || '',
    levantado_por:     document.getElementById('f4_levantado_por')?.value || '',
    userName:          currentUser.nombre,
    userId:            currentUser.id,
    fecha_registro:    new Date().toISOString(),
  };

  const photoData = document.getElementById('f4_photo_data')?.value || '';
  const baseId = Date.now();

  nichosData.forEach(function(nicho, i) {
    const localId = baseId + i;
    const registro = Object.assign({}, dataBoveda, {
      formId:              '4n',
      sheet:               'Nichos_Difuntos',
      formName:            'Nichos y Difuntos',
      status:              'pending',
      localId:             localId,
      codigo_nicho:        nicho.codigo || '',
      estado_nicho:        nicho.estado || '',
      terminal_nicho:      nicho.terminal || '',
      posicion_nicho:      nicho.posicion || '',
      nombre_difunto:      nicho.nombre || 'VACÍO',
      fecha_fallecimiento: nicho.fecha_fallecimiento || '',
      edad_fallecimiento:  nicho.edad || '',
      observaciones_nicho: nicho.observaciones || '',
      foto_nicho:          nicho.foto || '',
      tiene_foto:          (photoData || nicho.foto) ? 'Si' : 'No',
    });

    try {
      const cache = JSON.parse(localStorage.getItem('registros_cache')||'[]');
      cache.push(registro);
      localStorage.setItem('registros_cache', JSON.stringify(cache));
    } catch(e) {}

    if (i === 0 && photoData) guardarFotoLocal(localId, photoData);

    if (isOnline) {
      const dataConFoto = Object.assign({}, registro);
      if (i === 0) dataConFoto.photo_data = photoData;
      window.setTimeout(function() {
        sendToSheets(dataConFoto)
          .then(function() { updateCacheStatus(localId,'synced'); if(i===0) borrarFotoLocal(localId); })
          .catch(function() {});
      }, 800 + (i * 300));
    }
  });

  if (btn) { btn.classList.remove('processing'); btn.textContent='💾 Guardar bóveda y nichos'; btn.style.opacity='1'; }
  updatePending();
  showOkModal('✅ Bóveda guardada',
    nichosData.length + ' nicho(s) registrado(s).' +
    (isOnline ? ' Sincronizando...' : ' Se enviará al conectarse.'));
  resetForm(4);
}


init();
