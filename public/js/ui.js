// Utilidades de interfaz: plantillas seguras (escape anti-XSS), formularios con validación en línea,
// chips de estado, gráficos SVG y notificaciones.

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join('') : v === null || v === undefined || v === false ? '' : esc(v));
/** Plantilla HTML con escape automático de valores interpolados. */
export function html(strings, ...vals) {
  return raw(strings.reduce((acc, s, i) => acc + s + (i < vals.length ? fmt(vals[i]) : ''), ''));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Catálogos de etiquetas ----------
export const ESTADOS_EVAL = {
  IMPLEMENTADO: { label: 'Implementado', color: '#2E9E5B' },
  PARCIAL: { label: 'Parcial', color: '#F2A900' },
  NO_IMPLEMENTADO: { label: 'No implementado', color: '#D64545' },
  NO_APLICABLE: { label: 'No aplicable', color: '#8A98A3' },
  PENDIENTE: { label: 'Pendiente', color: '#B9C3CC' },
};
export const ESTADOS_AUD = {
  BORRADOR: 'Borrador', EN_EJECUCION: 'En ejecución', EN_REVISION: 'En revisión', CERRADA: 'Cerrada',
};
export const SEVERIDAD = { ALTA: { label: 'Alta', color: '#D64545' }, MEDIA: { label: 'Media', color: '#F2A900' }, BAJA: { label: 'Baja', color: '#2F7FBF' } };

export const chip = (estado) => html`<span class="chip ${estado}">${ESTADOS_EVAL[estado]?.label || ESTADOS_AUD[estado] || SEVERIDAD[estado]?.label || estado}</span>`;
export const pct = (n) => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')} %`);
export const fecha = (s) => {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s.replace(' ', 'T') + (s.includes('Z') || s.length <= 10 ? '' : 'Z'));
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
};
export const fechaHora = (s) => {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};
export const today = () => new Date().toLocaleDateString('en-CA');

// ---------- Íconos (SVG inline) ----------
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  audit: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
  catalog: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M8 7h8M8 11h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};
export const icon = (name) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`);

// ---------- Notificaciones ----------
export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

// ---------- Formularios ----------
export function formData(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
    else if (el.type !== 'file') data[el.name] = el.value;
  }
  return data;
}

export function clearErrors(form) {
  $$('.field-error', form).forEach((e) => (e.textContent = ''));
  $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  const fe = $('.form-error', form);
  if (fe) fe.innerHTML = '';
}

/** Muestra errores junto a cada campo, conservando lo digitado. */
export function showErrors(form, fields = {}, general = null, problemas = null) {
  clearErrors(form);
  let first = null;
  for (const [name, msg] of Object.entries(fields || {})) {
    const slot = $(`.field-error[data-for="${name}"]`, form);
    const input = form.elements[name];
    if (slot) slot.textContent = msg;
    if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
    if (!slot && general === null) general = msg;
  }
  const fe = $('.form-error', form);
  if (fe && (general || problemas?.length)) {
    fe.innerHTML = html`${general || ''}${problemas?.length ? html`<ul>${problemas.map((p) => html`<li>${p}</li>`)}</ul>` : ''}`.s;
  }
  (first || fe)?.focus?.();
  if (first?.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Validación en cliente basada en atributos (required, minlength, data-after). */
export function validateClient(form) {
  const fields = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.closest('[hidden]')) continue;
        const v = (el.value || '').trim();
    if (el.required && el.type === 'radio') {
      if (!form.querySelector(`[name="${el.name}"]:checked`)) fields[el.name] = 'Seleccione una opción.';
    } else if (el.required && !v) fields[el.name] = 'Este campo es obligatorio.';
    else if (v && el.minLength > 0 && v.length < el.minLength) fields[el.name] = `Debe tener al menos ${el.minLength} caracteres.`;
    else if (v && el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fields[el.name] = 'El formato no es válido.';
    else if (v && el.type === 'number' && ((el.min && Number(v) < Number(el.min)) || (el.max && Number(v) > Number(el.max)))) fields[el.name] = `Debe estar entre ${el.min} y ${el.max}.`;
    if (!fields[el.name] && v && el.dataset.after) {
      const other = form.elements[el.dataset.after]?.value;
      if (other && v < other) fields[el.name] = el.dataset.afterMsg || 'La fecha no es válida.';
    }
  }
  if (Object.keys(fields).length) { showErrors(form, fields, 'Revise los campos marcados.'); return false; }
  return true;
}

/** Conecta un formulario: valida en cliente, envía y muestra errores del servidor. */
export function bindForm(form, onSubmit, { validate = true } = {}) {
  form.noValidate = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    if (validate && !validateClient(form)) return;
    const btn = form.querySelector('[type="submit"]');
    btn && (btn.disabled = true);
    try {
      await onSubmit(formData(form), form);
    } catch (err) {
      if (err.fields || err.problemas) showErrors(form, err.fields, err.message, err.problemas);
      else { showErrors(form, {}, err.message); toast(err.message, 'err'); }
    } finally {
      btn && (btn.disabled = false);
    }
  });
  form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid')) {
      e.target.removeAttribute('aria-invalid');
      const slot = $(`.field-error[data-for="${e.target.name}"]`, form);
      if (slot) slot.textContent = '';
    }
  });
}

/** Campo de formulario estándar. */
export function field({ name, label, type = 'text', value = '', required = false, min, max, minlength, help, options, rows = 3, attrs = '', placeholder = '' }) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  const req = required ? raw(' required') : '';
  const common = raw(`id="${id}" name="${esc(name)}" data-label="${esc(label)}"${minlength ? ` minlength="${minlength}"` : ''}${min !== undefined ? ` min="${esc(min)}"` : ''}${max !== undefined ? ` max="${esc(max)}"` : ''} ${attrs}`);
  let control;
  if (type === 'textarea') control = html`<textarea ${common}${req} rows="${rows}" placeholder="${placeholder}">${value}</textarea>`;
  else if (type === 'select') control = html`<select ${common}${req}>${options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(value) ? raw('selected') : ''}>${o.label}</option>`)}</select>`;
  else control = html`<input ${common}${req} type="${type}" value="${value ?? ''}" placeholder="${placeholder}">`;
  return html`<div class="field">
    <label for="${id}">${label}${required ? raw('<span class="req" aria-hidden="true">*</span>') : ''}</label>
    ${control}
    ${help ? html`<span class="help">${help}</span>` : ''}
    <span class="field-error" data-for="${name}" role="alert"></span>
  </div>`;
}

// ---------- Modal ----------
export function modal(title, body, onMount) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = html`<div class="dlg-head"><h2>${title}</h2><button class="btn ghost" data-close aria-label="Cerrar">✕</button></div><div class="dlg-body">${body}</div>`.s;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  onMount?.(dlg);
  return dlg;
}

export function confirmDialog(message, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const dlg = modal('Confirmar acción', html`<p>${message}</p><div class="actions" style="justify-content:flex-end">
      <button class="btn secondary" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${ok}</button></div>`);
    dlg.querySelector('[data-ok]').addEventListener('click', () => { result = true; dlg.close(); });
    dlg.addEventListener('close', () => resolve(result));
  });
}

// ---------- Gráficos ----------
/** Gráfico de anillo SVG. items: [{label, value, color}] */
export function donut(items, center = '', sub = '') {
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 60; const C = 2 * Math.PI * R;
  let off = 0;
  const arcs = total ? items.filter((i) => i.value).map((i) => {
    const len = (i.value / total) * C;
    const a = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${i.color}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${esc(i.label)}: ${i.value}</title></circle>`;
    off += len;
    return a;
  }).join('') : `<circle r="${R}" cx="80" cy="80" fill="none" stroke="#e5eaef" stroke-width="22"/>`;
  return html`<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 160 160" role="img" aria-label="${items.map((i) => `${i.label}: ${i.value}`).join(', ')}">
      ${raw(arcs)}
      <text x="80" y="78" text-anchor="middle" font-size="24" font-weight="700" fill="#003366">${center}</text>
      <text x="80" y="98" text-anchor="middle" font-size="11" fill="#5d6b78">${sub}</text>
    </svg>
    <ul class="legend">${items.map((i) => html`<li><i style="background:${i.color}"></i>${i.label}<b>${i.value}</b></li>`)}</ul>
  </div>`;
}

/** Barras horizontales. items: [{label, value, color, display?}] */
export function bars(items, max = null) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return html`<div class="bars">${items.map((i) => html`<div class="bar-row">
    <span>${i.label}</span>
    <div class="track" role="img" aria-label="${i.label}: ${i.display ?? i.value}"><div class="fill" style="width:${(100 * i.value) / m}%;background:${i.color}"></div></div>
    <span class="v">${i.display ?? i.value}</span></div>`)}</div>`;
}

export function stackbar(ind) {
  const parts = ['IMPLEMENTADO', 'PARCIAL', 'NO_IMPLEMENTADO', 'NO_APLICABLE', 'PENDIENTE'];
  const vals = { IMPLEMENTADO: ind.implementados, PARCIAL: ind.parciales, NO_IMPLEMENTADO: ind.no_implementados, NO_APLICABLE: ind.no_aplicables, PENDIENTE: ind.pendientes };
  const t = ind.seleccionados || 1;
  return html`<div class="stackbar" role="img" aria-label="${parts.map((p) => `${ESTADOS_EVAL[p].label}: ${vals[p]}`).join(', ')}">
    ${parts.filter((p) => vals[p]).map((p) => html`<span style="width:${(100 * vals[p]) / t}%;background:${ESTADOS_EVAL[p].color}" title="${ESTADOS_EVAL[p].label}: ${vals[p]}"></span>`)}
  </div>`;
}

export const loading = () => html`<div class="empty"><p>Cargando…</p></div>`;
export const errorBox = (msg) => html`<div class="notice danger">${msg}</div>`;
