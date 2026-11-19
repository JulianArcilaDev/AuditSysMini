// RF02 · Catálogo y selección de controles para la auditoría (10 a 15).
import { api } from '../api.js';
import { html, toast } from '../ui.js';
import { go } from '../app.js';
import { auditHeader, loadAudit } from './shared.js';

const MIN = 10;
const MAX = 15;
// Sugerencia del ejemplo del curso para Empresa ABC (13 controles en las 4 categorías)
const SUGERIDOS = ['5.1', '5.15', '5.18', '5.24', '6.3', '7.2', '8.5', '8.7', '8.8', '8.13', '8.15', '8.23', '8.31'];

export async function render(el, [id]) {
  const [aud, controles] = await Promise.all([loadAudit(api, id), api.get('/controles')]);
  const editable = aud.editable && ['BORRADOR', 'EN_EJECUCION'].includes(aud.estado);
  const sel = new Set(aud.evaluaciones.map((e) => e.id_control));
  const bloqueados = new Set(aud.evaluaciones.filter((e) => e.n_evidencias || e.n_hallazgos).map((e) => e.id_control));
  let q = '';
  let cat = '';
  let soloSel = false;

  el.innerHTML = html`
  ${auditHeader(aud, '/controles')}
  <div class="card">
    <div class="card-head"><div><h2>Catálogo ISO/IEC 27002:2022</h2><p class="muted" style="margin:0">Seleccione entre ${MIN} y ${MAX} controles pertinentes al alcance. El criterio de cada control se usa luego en la evaluación y en los hallazgos.</p></div>
      ${editable ? html`<button class="btn secondary sm" id="sugerir" type="button">Usar sugerencia del ejemplo (13)</button>` : ''}</div>
    <div class="toolbar">
      <div class="field grow"><label for="q">Buscar</label><input id="q" type="search" placeholder="Código, nombre o criterio"></div>
      <div class="field"><label for="cat">Categoría</label><select id="cat"><option value="">Todas</option><option>Organizacional</option><option>Personas</option><option>Físico</option><option>Tecnológico</option></select></div>
      <label class="checkbox" style="padding-bottom:.6rem"><input type="checkbox" id="solo"> Solo seleccionados</label>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th style="width:70px">En auditoría</th><th style="width:70px">Código</th><th>Control y criterio</th><th style="width:130px">Categoría</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
  </div>
  ${editable ? html`<div class="sticky-foot">
    <div><span class="counter" id="counter"></span> <span class="muted" id="counter-msg"></span></div>
    <div class="actions"><a class="btn secondary" href="#/auditorias/${id}">Cancelar</a><button class="btn" id="save">Guardar selección</button></div>
  </div>` : html`<p class="muted" style="margin-top:1rem">La selección solo puede modificarse en estado Borrador o En ejecución, por el auditor responsable.</p>`}`.s;

  const rows = el.querySelector('#rows');
  const draw = () => {
    const ql = q.toLowerCase();
    const list = controles.filter((c) => (!cat || c.categoria === cat) && (!soloSel || sel.has(c.id_control))
      && (!ql || `${c.codigo_iso} ${c.nombre} ${c.criterio}`.toLowerCase().includes(ql)));
    rows.innerHTML = list.map((c) => html`<tr>
      <td><label class="switch" title="${bloqueados.has(c.id_control) ? 'Tiene evidencias u hallazgos: no se puede quitar' : 'Incluir en la auditoría'}">
        <input type="checkbox" data-id="${c.id_control}" ${sel.has(c.id_control) ? html`checked` : ''} ${!editable || bloqueados.has(c.id_control) ? html`disabled` : ''} aria-label="Incluir control ${c.codigo_iso}"><span></span></label></td>
      <td><strong>${c.codigo_iso}</strong></td>
      <td><strong>${c.nombre}</strong><br><small>${c.criterio}</small>${c.pregunta ? html`<br><small><em>Pregunta orientadora: ${c.pregunta}</em></small>` : ''}</td>
      <td>${c.categoria}</td></tr>`.s).join('') || html`<tr><td colspan="4" class="empty">Sin resultados.</td></tr>`.s;
    updateCounter();
  };
  const updateCounter = () => {
    const n = sel.size;
    const c = el.querySelector('#counter');
    if (!c) return;
    c.textContent = `${n} seleccionados`;
    const ok = n >= MIN && n <= MAX;
    c.className = `counter ${ok ? 'good' : 'bad'}`;
    el.querySelector('#counter-msg').textContent = ok ? `(rango permitido ${MIN}–${MAX})` : n < MIN ? `· faltan ${MIN - n} para el mínimo de ${MIN}` : `· excede el máximo de ${MAX}`;
    el.querySelector('#save').disabled = n > MAX || n === 0;
  };

  rows.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-id]');
    if (!cb) return;
    const cid = Number(cb.dataset.id);
    if (cb.checked) {
      if (sel.size >= MAX) { cb.checked = false; toast(`Máximo ${MAX} controles por auditoría.`, 'err'); return; }
      sel.add(cid);
    } else sel.delete(cid);
    updateCounter();
  });
  el.querySelector('#q').addEventListener('input', (e) => { q = e.target.value; draw(); });
  el.querySelector('#cat').addEventListener('change', (e) => { cat = e.target.value; draw(); });
  el.querySelector('#solo').addEventListener('change', (e) => { soloSel = e.target.checked; draw(); });
  el.querySelector('#sugerir')?.addEventListener('click', () => {
    sel.clear();
    bloqueados.forEach((b) => sel.add(b));
    controles.filter((c) => SUGERIDOS.includes(c.codigo_iso)).forEach((c) => sel.size < MAX && sel.add(c.id_control));
    draw();
  });
  el.querySelector('#save')?.addEventListener('click', async () => {
    try {
      const r = await api.put(`/auditorias/${id}/controles`, { controles: [...sel] });
      toast(`Selección guardada: ${r.seleccionados} controles.`);
      if (r.seleccionados < MIN) toast(`Recuerde: necesita al menos ${MIN} controles para iniciar la ejecución.`, 'err');
      go(`/auditorias/${id}`);
    } catch (err) {
      toast(err.fields?.controles || err.message, 'err');
    }
  });
  draw();
}
