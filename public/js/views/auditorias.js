import { api } from '../api.js';
import { html, icon, chip, pct, fecha, stackbar, ESTADOS_AUD } from '../ui.js';
import { go } from '../app.js';

export async function render(el) {
  const list = await api.get('/auditorias');
  const draw = (q = '', estado = '') => {
    const rows = list.filter((a) => (!estado || a.estado === estado) && (!q || `${a.organizacion} ${a.auditor_nombre} ${a.objetivo}`.toLowerCase().includes(q.toLowerCase())));
    el.querySelector('#tbody-wrap').innerHTML = rows.length ? html`<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Organización / objetivo</th><th>Periodo</th><th>Responsable</th><th>Estado</th><th style="min-width:160px">Controles por estado</th><th class="num">Cumplimiento</th><th class="num">Hallazgos</th></tr></thead>
      <tbody>${rows.map((a) => html`<tr class="clickable" data-id="${a.id_auditoria}">
        <td>${a.id_auditoria}</td>
        <td><a href="#/auditorias/${a.id_auditoria}"><strong>${a.organizacion}</strong></a><br><small>${a.objetivo.length > 90 ? a.objetivo.slice(0, 90) + '…' : a.objetivo}</small></td>
        <td><small>${fecha(a.fecha_inicio)}<br>${fecha(a.fecha_fin)}</small></td>
        <td>${a.auditor_nombre}</td><td>${chip(a.estado)}</td>
        <td>${a.indicadores.seleccionados ? stackbar(a.indicadores) : html`<small class="muted">Sin controles</small>`}<small>${a.indicadores.evaluados}/${a.indicadores.seleccionados} evaluados</small></td>
        <td class="num">${pct(a.indicadores.cumplimiento_base)}</td><td class="num">${a.n_hallazgos}</td></tr>`)}</tbody></table></div>`.s
      : html`<div class="card empty"><h3>No hay auditorías que coincidan</h3><p>Ajuste los filtros o cree una nueva auditoría.</p></div>`.s;
    el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(`/auditorias/${tr.dataset.id}`); }));
  };

  el.innerHTML = html`
  <div class="page-head">
    <div><h1>Auditorías</h1><p>Registro y consulta de auditorías de seguridad de la información.</p></div>
    <a class="btn" href="#/auditorias/nueva">${icon('plus')} Nueva auditoría</a>
  </div>
  <div class="toolbar">
    <div class="field grow"><label for="q">Buscar</label><input id="q" type="search" placeholder="Organización, objetivo o responsable"></div>
    <div class="field"><label for="est">Estado</label><select id="est"><option value="">Todos</option>${Object.entries(ESTADOS_AUD).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
  </div>
  <div id="tbody-wrap"></div>`.s;
  const q = el.querySelector('#q');
  const est = el.querySelector('#est');
  const upd = () => draw(q.value, est.value);
  q.addEventListener('input', upd);
  est.addEventListener('change', upd);
  draw();
}
