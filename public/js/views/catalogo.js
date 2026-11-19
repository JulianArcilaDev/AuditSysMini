// Módulo 2 · Catálogo de controles: consulta (todos) y administración (solo admin, RNF04).
import { api } from '../api.js';
import { html, icon, field, bindForm, toast, modal } from '../ui.js';
import { reload } from '../app.js';

const CATS = ['Organizacional', 'Personas', 'Físico', 'Tecnológico'];

export async function render(el, _p, { user }) {
  const admin = user.rol === 'admin';
  const controles = await api.get(`/controles${admin ? '?activos=0' : ''}`);
  el.innerHTML = html`
  <div class="page-head">
    <div><h1>Catálogo de controles</h1><p>ISO/IEC 27002:2022 · ${controles.length} controles. ${admin ? 'Como administrador puede crear y editar controles.' : 'Consulta (la edición está restringida a administradores).'}</p></div>
    ${admin ? html`<button class="btn" id="nuevo">${icon('plus')} Nuevo control</button>` : ''}
  </div>
  <div class="toolbar">
    <div class="field grow"><label for="q">Buscar</label><input id="q" type="search" placeholder="Código, nombre o criterio"></div>
    <div class="field"><label for="cat">Categoría</label><select id="cat"><option value="">Todas</option>${CATS.map((c) => html`<option>${c}</option>`)}</select></div>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th style="width:70px">Código</th><th>Control</th><th>Criterio</th><th>Evidencia sugerida</th><th style="width:120px">Categoría</th>${admin ? html`<th></th>` : ''}</tr></thead>
    <tbody id="rows"></tbody></table></div>`.s;

  const rows = el.querySelector('#rows');
  const draw = () => {
    const q = el.querySelector('#q').value.toLowerCase();
    const cat = el.querySelector('#cat').value;
    rows.innerHTML = controles.filter((c) => (!cat || c.categoria === cat) && (!q || `${c.codigo_iso} ${c.nombre} ${c.criterio}`.toLowerCase().includes(q)))
      .map((c) => html`<tr style="${c.activo ? '' : 'opacity:.5'}"><td><strong>${c.codigo_iso}</strong></td><td><strong>${c.nombre}</strong>${c.activo ? '' : html`<br><span class="chip plain">Inactivo</span>`}${c.pregunta ? html`<br><small><em>${c.pregunta}</em></small>` : ''}</td>
        <td><small>${c.criterio}</small></td><td><small>${c.evidencia_sugerida || '—'}</small></td><td>${c.categoria}</td>
        ${admin ? html`<td><button class="btn ghost sm" data-edit="${c.id_control}" aria-label="Editar ${c.codigo_iso}">${icon('edit')}</button></td>` : ''}</tr>`.s).join('');
  };
  el.querySelector('#q').addEventListener('input', draw);
  el.querySelector('#cat').addEventListener('change', draw);
  draw();
  if (!admin) return;
  el.querySelector('#nuevo').addEventListener('click', () => controlModal());
  rows.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) controlModal(controles.find((c) => c.id_control === Number(b.dataset.edit)));
  });
}

function controlModal(c = null) {
  const dlg = modal(c ? `Editar control ${c.codigo_iso}` : 'Nuevo control', html`
    <form class="form" id="c-form">
      <div class="form-error" tabindex="-1" role="alert"></div>
      <div class="form-row">
        ${field({ name: 'codigo_iso', label: 'Código', value: c?.codigo_iso || '', required: true, placeholder: '8.23' })}
        ${field({ name: 'categoria', label: 'Categoría', type: 'select', value: c?.categoria || 'Tecnológico', required: true, options: CATS.map((x) => ({ value: x, label: x })) })}
      </div>
      ${field({ name: 'nombre', label: 'Nombre', value: c?.nombre || '', required: true, minlength: 3 })}
      ${field({ name: 'criterio', label: 'Criterio / descripción', type: 'textarea', value: c?.criterio || '', required: true, minlength: 10 })}
      ${field({ name: 'pregunta', label: 'Pregunta orientadora', type: 'textarea', rows: 2, value: c?.pregunta || '' })}
      ${field({ name: 'ejemplo', label: 'Ejemplo de aplicación', value: c?.ejemplo || '' })}
      ${field({ name: 'evidencia_sugerida', label: 'Evidencia objetiva sugerida', value: c?.evidencia_sugerida || '' })}
      ${field({ name: 'fuente', label: 'Fuente normativa', value: c?.fuente || 'ISO/IEC 27002:2022' })}
      ${c ? html`<label class="checkbox"><input type="checkbox" name="activo" ${c.activo ? html`checked` : ''}> Activo (disponible para nuevas selecciones)</label>` : ''}
      <div class="actions" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" type="submit">Guardar</button></div>
    </form>`);
  bindForm(dlg.querySelector('#c-form'), async (d) => {
    if (c) await api.put(`/controles/${c.id_control}`, { ...d, activo: d.activo ? 1 : 0 });
    else await api.post('/controles', d);
    toast('Control guardado.');
    dlg.close();
    reload();
  });
}
