// Punto de entrada del frontend: sesión, layout y enrutador por hash (SPA sin dependencias).
import { api } from './api.js';
import { html, icon, $, toast, loading, errorBox } from './ui.js';
import * as Login from './views/login.js';
import * as Dashboard from './views/dashboard.js';
import * as Auditorias from './views/auditorias.js';
import * as AuditoriaForm from './views/auditoria-form.js';
import * as AuditoriaResumen from './views/auditoria-resumen.js';
import * as Seleccion from './views/seleccion.js';
import * as Evaluacion from './views/evaluacion.js';
import * as Hallazgos from './views/hallazgos.js';
import * as Trazabilidad from './views/trazabilidad.js';
import * as Informe from './views/informe.js';
import * as Catalogo from './views/catalogo.js';
import * as Usuarios from './views/usuarios.js';

export const state = { user: null };

const routes = [
  [/^\/$/, Dashboard, 'dashboard'],
  [/^\/auditorias$/, Auditorias, 'auditorias'],
  [/^\/auditorias\/nueva$/, AuditoriaForm, 'auditorias'],
  [/^\/auditorias\/(\d+)\/editar$/, AuditoriaForm, 'auditorias'],
  [/^\/auditorias\/(\d+)$/, AuditoriaResumen, 'auditorias'],
  [/^\/auditorias\/(\d+)\/controles$/, Seleccion, 'auditorias'],
  [/^\/auditorias\/(\d+)\/evaluacion(?:\/(\d+))?$/, Evaluacion, 'auditorias'],
  [/^\/auditorias\/(\d+)\/hallazgos$/, Hallazgos, 'auditorias'],
  [/^\/auditorias\/(\d+)\/trazabilidad$/, Trazabilidad, 'auditorias'],
  [/^\/auditorias\/(\d+)\/informe$/, Informe, 'auditorias'],
  [/^\/informes\/(\d+)$/, Informe, 'auditorias', 'saved'],
  [/^\/catalogo$/, Catalogo, 'catalogo'],
  [/^\/usuarios$/, Usuarios, 'usuarios', 'admin'],
];

export const go = (path) => { location.hash = `#${path}`; };
export const currentPath = () => location.hash.replace(/^#/, '').split('?')[0] || '/';
export const query = () => new URLSearchParams(location.hash.split('?')[1] || '');

function layout(active) {
  const u = state.user;
  const link = (href, key, ic, label) => html`<a href="#${href}" class="${active === key ? 'active' : ''}" ${active === key ? html`aria-current="page"` : ''}>${icon(ic)}${label}</a>`;
  return html`<div class="layout" id="layout">
    <aside class="sidebar" aria-label="Navegación principal">
      <a class="brand" href="#/"><img src="img/favicon.svg" alt=""><span>AuditSys Mini<small>Auditoría de SI · ISO 27002:2022</small></span></a>
      <nav class="nav">
        ${link('/', 'dashboard', 'dashboard', 'Dashboard')}
        ${link('/auditorias', 'auditorias', 'audit', 'Auditorías')}
        ${link('/catalogo', 'catalogo', 'catalog', 'Catálogo de controles')}
        ${u.rol === 'admin' ? link('/usuarios', 'usuarios', 'users', 'Usuarios') : ''}
      </nav>
      <div class="user"><strong>${u.nombre}</strong>${u.correo}<br><span class="chip plain">${u.rol === 'admin' ? 'Administrador' : 'Auditor'}</span>
        <button class="btn secondary sm" id="logout">${icon('logout')} Cerrar sesión</button></div>
    </aside>
    <div class="main">
      <header class="topbar"><button id="menu-btn" aria-label="Abrir menú" aria-expanded="false">${icon('menu')}</button><strong>AuditSys Mini</strong></header>
      <main class="content" id="content" tabindex="-1"></main>
    </div>
  </div>`;
}

let renderSeq = 0;

async function router() {
  const path = currentPath();
  const app = $('#app');
  if (!state.user) {
    try { state.user = await api.get('/auth/me'); } catch { state.user = null; }
  }
  if (!state.user) {
    if (path !== '/login') return go('/login');
    app.innerHTML = '';
    return Login.render(app, [], { onLogin: (u) => { state.user = u; go('/'); } });
  }
  if (path === '/login') return go('/');

  const match = routes.map(([re, view, key, flag]) => [path.match(re), view, key, flag]).find(([m]) => m);
  if (!match) return go('/');
  const [m, view, key, flag] = match;
  if (flag === 'admin' && state.user.rol !== 'admin') { toast('Acceso denegado: se requiere rol administrador.', 'err'); return go('/'); }

  app.innerHTML = layout(key).s;
  bindLayout();
  const content = $('#content');
  content.innerHTML = loading().s;
  const seq = ++renderSeq;
  try {
    await view.render(content, m.slice(1), { user: state.user, flag, isCurrent: () => seq === renderSeq });
    const h1 = content.querySelector('h1');
    document.title = `${h1?.firstChild?.textContent?.trim() || 'AuditSys Mini'} · AuditSys Mini`;
  } catch (err) {
    console.error(err);
    if (seq === renderSeq) content.innerHTML = errorBox(err.message || 'Error al cargar la vista.').s;
  }
  const step = document.querySelector('.stepper a.active');
  if (step) step.parentElement.scrollLeft = step.offsetLeft - 16;
  window.scrollTo(0, 0);
}

function bindLayout() {
  $('#logout').addEventListener('click', async () => {
    await api.post('/auth/logout');
    state.user = null;
    go('/login');
  });
  const lay = $('#layout');
  const btn = $('#menu-btn');
  btn.addEventListener('click', () => {
    const open = lay.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded', String(open));
  });
  lay.addEventListener('click', (e) => {
    if (lay.classList.contains('menu-open') && (e.target === lay || e.target.closest('.nav a'))) lay.classList.remove('menu-open');
  });
}

window.addEventListener('hashchange', router);
window.addEventListener('auth:expired', () => {
  if (state.user) { state.user = null; toast('La sesión expiró. Inicie sesión nuevamente.', 'err'); go('/login'); }
});
router();

/** Re-renderiza la vista actual (tras guardar). */
export const reload = () => router();
