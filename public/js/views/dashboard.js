// RF09 · Dashboard: cuadro integral de indicadores de gestión de auditorías.
import { api } from '../api.js';
import { html, icon, chip, pct, fecha, donut, bars, ESTADOS_EVAL, SEVERIDAD, ESTADOS_AUD } from '../ui.js';
import { go, query } from '../app.js';

export async function render(el) {
  const filtro = query().get('auditoria') || '';
  const d = await api.get(`/dashboard${filtro ? `?auditoria=${encodeURIComponent(filtro)}` : ''}`);
  const i = d.indicadores;
  const audSel = d.auditorias.find((a) => String(a.id_auditoria) === filtro);

  const estadoItems = ['IMPLEMENTADO', 'PARCIAL', 'NO_IMPLEMENTADO', 'NO_APLICABLE', 'PENDIENTE'].map((k) => ({
    label: ESTADOS_EVAL[k].label, color: ESTADOS_EVAL[k].color,
    value: { IMPLEMENTADO: i.implementados, PARCIAL: i.parciales, NO_IMPLEMENTADO: i.no_implementados, NO_APLICABLE: i.no_aplicables, PENDIENTE: i.pendientes }[k],
  })).filter((x) => x.value || x.label !== 'Pendiente');

  el.innerHTML = html`
  <div class="page-head">
    <div><h1>Dashboard</h1><p>Indicadores de gestión calculados desde la base de datos${audSel ? html` · <strong>${audSel.organizacion}</strong>` : ' · todas las auditorías'}.</p></div>
    <div class="actions">
      <div class="field"><label for="f-aud" class="sr-only" style="font-size:.8rem">Filtrar por auditoría</label>
        <select id="f-aud"><option value="">Todas las auditorías</option>${d.auditorias.map((a) => html`<option value="${a.id_auditoria}" ${String(a.id_auditoria) === filtro ? html`selected` : ''}>${a.organizacion} (#${a.id_auditoria})</option>`)}</select></div>
      <a class="btn" href="#/auditorias/nueva">${icon('plus')} Nueva auditoría</a>
    </div>
  </div>

  <div class="grid grid-4">
    <div class="card kpi"><div class="label">Cumplimiento base</div><div class="value">${pct(i.cumplimiento_base)}</div><div class="hint">${i.implementados} implementados de ${i.aplicables} aplicables</div></div>
    <div class="card kpi"><div class="label">Índice ponderado</div><div class="value">${pct(i.indice_ponderado)}</div><div class="hint">Parciales cuentan 0,5</div></div>
    <div class="card kpi"><div class="label">Controles evaluados</div><div class="value">${i.evaluados}<small style="font-size:1rem;color:var(--muted)"> / ${i.seleccionados}</small></div><div class="hint">Avance ${pct(i.avance)}</div></div>
    <div class="card kpi"><div class="label">Hallazgos</div><div class="value">${d.total_hallazgos}</div><div class="hint">${d.hallazgos_por_severidad.ALTA} de severidad alta · ${d.hallazgos_sin_recomendacion} sin recomendación</div></div>
  </div>

  <div class="grid grid-3" style="margin-top:1rem">
    <div class="card span-2">
      <div class="card-head"><h2>Controles por estado</h2><span class="muted">${i.seleccionados} controles</span></div>
      ${donut(estadoItems, pct(i.cumplimiento_base), 'cumplimiento')}
    </div>
    <div class="card">
      <div class="card-head"><h2>Hallazgos por severidad</h2></div>
      ${bars(['ALTA', 'MEDIA', 'BAJA'].map((s) => ({ label: SEVERIDAD[s].label, value: d.hallazgos_por_severidad[s], color: SEVERIDAD[s].color })))}
      <hr style="border:0;border-top:1px solid var(--border);margin:1rem 0">
      <div class="grid grid-2" style="gap:.5rem;font-size:.88rem">
        <div><div class="muted">Recomendaciones</div><strong style="font-size:1.2rem">${d.recomendaciones.total}</strong></div>
        <div><div class="muted">Plazo promedio</div><strong style="font-size:1.2rem">${d.recomendaciones.plazo_promedio_dias ?? '—'}</strong> días</div>
        <div><div class="muted">Evidencias</div><strong style="font-size:1.2rem">${d.evidencias.total}</strong></div>
        <div><div class="muted">Simuladas</div><strong style="font-size:1.2rem">${d.evidencias.simuladas}</strong></div>
      </div>
    </div>
  </div>

  <div class="grid grid-2" style="margin-top:1rem">
    <div class="card">
      <div class="card-head"><h2>Cumplimiento por categoría</h2><span class="muted">ISO/IEC 27002:2022</span></div>
      ${bars(d.por_categoria.map((c) => ({ label: c.categoria, value: c.cumplimiento_base ?? 0, display: c.aplicables ? pct(c.cumplimiento_base) : 'N/D', color: '#00C6D0' })), 100)}
      <p class="muted" style="font-size:.8rem;margin:.75rem 0 0">Categorías sin controles aplicables se muestran como N/D.</p>
    </div>
    <div class="card">
      <div class="card-head"><h2>Auditorías por estado</h2><span class="muted">${d.auditorias.length} en total · promedio ${pct(d.cumplimiento_promedio)}</span></div>
      ${bars(Object.entries(d.auditorias_por_estado).map(([k, v]) => ({ label: ESTADOS_AUD[k], value: v, color: k === 'CERRADA' ? '#003366' : k === 'EN_REVISION' ? '#8b5cf6' : k === 'EN_EJECUCION' ? '#00C6D0' : '#8A98A3' })))}
    </div>
  </div>

  <div class="card" style="margin-top:1rem">
    <div class="card-head"><h2>Auditorías recientes</h2><a href="#/auditorias">Ver todas</a></div>
    ${d.auditorias.length ? html`<div class="table-wrap"><table>
      <thead><tr><th>Organización</th><th>Responsable</th><th>Estado</th><th class="num">Controles</th><th class="num">Avance</th><th class="num">Cumplimiento</th><th class="num">Hallazgos</th></tr></thead>
      <tbody>${d.auditorias.slice(0, 8).map((a) => html`<tr class="clickable" data-id="${a.id_auditoria}">
        <td><a href="#/auditorias/${a.id_auditoria}">${a.organizacion}</a><br><small>${fecha(a.fecha_inicio)} – ${fecha(a.fecha_fin)}</small></td>
        <td>${a.auditor_nombre}</td><td>${chip(a.estado)}</td><td class="num">${a.seleccionados}</td>
        <td class="num" style="min-width:110px"><div class="progress"><span style="width:${a.avance}%"></span></div><small>${pct(a.avance)}</small></td>
        <td class="num">${pct(a.cumplimiento_base)}</td><td class="num">${a.n_hallazgos}</td></tr>`)}</tbody></table></div>`
    : html`<div class="empty"><h3>Aún no hay auditorías</h3><p>Cree la primera auditoría para comenzar.</p></div>`}
  </div>

  <div class="formula" style="margin-top:1rem">
    <strong>Fórmulas:</strong> ${d.formulas.base} · ${d.formulas.ponderado} · ${d.formulas.aplicables}.
    Los indicadores son descriptivos y no constituyen certificación.
  </div>`.s;

  el.querySelector('#f-aud').addEventListener('change', (e) => go(e.target.value ? `/?auditoria=${e.target.value}` : '/'));
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(`/auditorias/${tr.dataset.id}`); }));
}
