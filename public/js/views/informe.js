// RF08 · Informe de auditoría generado desde la base de datos (vista previa, versiones e impresión/PDF).
import { api } from '../api.js';
import { html, icon, chip, pct, fecha, fechaHora, toast, donut, ESTADOS_EVAL } from '../ui.js';
import { go } from '../app.js';
import { auditHeader, loadAudit } from './shared.js';

export async function render(el, [id], { flag }) {
  if (flag === 'saved') return renderSaved(el, id);
  const [aud, secciones, preview] = await Promise.all([loadAudit(api, id), api.get('/informes/secciones'), api.get(`/auditorias/${id}/preview`)]);
  el.innerHTML = html`
  ${auditHeader(aud, '/informe')}
  <div class="grid" style="grid-template-columns:minmax(0,280px) minmax(0,1fr);align-items:start" id="inf-grid">
    <aside class="card no-print">
      <h2>Generar informe</h2>
      <p class="muted" style="font-size:.85rem">El informe se construye con los datos registrados y se guarda como una versión inmutable.</p>
      <form id="gen">
        ${secciones.map((s) => html`<label class="checkbox" style="margin:.35rem 0"><input type="checkbox" name="sec" value="${s.clave}" checked ${s.clave === 'limitaciones' ? html`disabled` : ''}> ${s.titulo}</label>`)}
        <p class="muted" style="font-size:.78rem">Las limitaciones siempre se incluyen (salvaguarda: no constituye certificación).</p>
        ${aud.puede_editar ? html`<button class="btn" type="submit" style="width:100%">Generar versión ${aud.informes.length + 1}</button>` : ''}
      </form>
      ${aud.estado !== 'CERRADA' ? html`<div class="notice warn" style="margin-top:1rem;font-size:.85rem">La auditoría aún no está cerrada; el informe será preliminar.</div>` : ''}
      <h3 style="margin-top:1.25rem">Versiones</h3>
      ${aud.informes.length ? html`<ul style="padding-left:1rem;margin:0">${aud.informes.map((i) => html`<li><a href="#/informes/${i.id_informe}">Versión ${i.version}</a><br><small>${fechaHora(i.generado_en)} · ${i.generado_por} · ${pct(i.cumplimiento_base)}</small></li>`)}</ul>` : html`<p class="muted">Ninguna todavía.</p>`}
    </aside>
    <section>
      <div class="actions no-print" style="justify-content:space-between;margin-bottom:.75rem"><strong>Vista previa (datos en vivo)</strong>
        <button class="btn secondary" id="print">${icon('print')} Imprimir / Guardar PDF</button></div>
      ${reportHtml(preview.contenido, { preliminar: aud.estado !== 'CERRADA' })}
    </section>
  </div>`.s;
  const mq = window.matchMedia('(max-width: 860px)');
  if (mq.matches) el.querySelector('#inf-grid').style.gridTemplateColumns = '1fr';
  el.querySelector('#print').addEventListener('click', () => window.print());
  el.querySelector('#gen').addEventListener('submit', async (e) => {
    e.preventDefault();
    const secs = [...e.target.querySelectorAll('input[name=sec]:checked')].map((c) => c.value);
    try {
      const r = await api.post(`/auditorias/${id}/informes`, { secciones: secs });
      toast(`Informe versión ${r.version} generado.`);
      go(`/informes/${r.id_informe}`);
    } catch (err) { toast(err.message, 'err'); }
  });
}

async function renderSaved(el, idInforme) {
  const inf = await api.get(`/informes/${idInforme}`);
  const a = inf.contenido.auditoria;
  el.innerHTML = html`
  <div class="page-head no-print">
    <div><div class="crumbs"><a href="#/auditorias">Auditorías</a> / <a href="#/auditorias/${a.id_auditoria}">#${a.id_auditoria}</a> / <a href="#/auditorias/${a.id_auditoria}/informe">Informe</a> / v${inf.version}</div>
      <h1>Informe de auditoría · versión ${inf.version}</h1><p>Generado el ${fechaHora(inf.generado_en)} por ${inf.generado_por}. Instantánea inmutable de la base de datos.</p></div>
    <div class="actions"><a class="btn secondary" href="#/auditorias/${a.id_auditoria}/informe">${icon('back')} Volver</a><button class="btn" id="print">${icon('print')} Imprimir / Guardar PDF</button></div>
  </div>
  ${reportHtml(inf.contenido, { version: inf.version, generado: inf.generado_en, por: inf.generado_por, secciones: inf.secciones, preliminar: a.estado !== 'CERRADA' })}`.s;
  el.querySelector('#print').addEventListener('click', () => window.print());
}

/** Plantilla del informe (8 secciones, según el documento orientador). */
export function reportHtml(c, { version = null, generado = null, por = null, secciones = null, preliminar = false } = {}) {
  const a = c.auditoria;
  const i = c.indicadores;
  const on = (k) => !secciones || secciones.includes(k);
  let n = 0;
  const h2 = (t) => html`<h2>${++n}. ${t}</h2>`;
  const recs = c.hallazgos.flatMap((h) => h.recomendaciones.map((r) => ({ ...r, hallazgo: h.codigo, control: h.codigo_iso })));
  return html`<article class="report">
    <header>
      <div><div class="muted" style="font-size:.8rem;text-transform:uppercase;letter-spacing:.06em">Informe de auditoría de seguridad de la información</div>
        <h1>${a.organizacion}</h1>
        <div>${fecha(a.fecha_inicio)} – ${fecha(a.fecha_fin)} · Auditor responsable: ${a.auditor_nombre}</div></div>
      <div style="text-align:right;font-size:.85rem">
        <div><strong>${version ? `Versión ${version}` : 'Vista previa'}</strong></div>
        <div>${generado ? fechaHora(generado) : fechaHora(new Date().toISOString())}</div>
        ${por ? html`<div>Generado por: ${por}</div>` : ''}
        <div>Estado: ${chip(a.estado)}</div>
        ${preliminar ? html`<div class="watermark">INFORME PRELIMINAR</div>` : ''}
      </div>
    </header>

    ${on('datos') ? html`${h2('Datos de la auditoría')}
      <dl class="kv"><dt>Organización</dt><dd>${a.organizacion}</dd><dt>Objetivo</dt><dd>${a.objetivo}</dd>
      <dt>Periodo</dt><dd>${fecha(a.fecha_inicio)} – ${fecha(a.fecha_fin)}</dd><dt>Auditor responsable</dt><dd>${a.auditor_nombre}</dd>
      <dt>Referentes</dt><dd>${a.referentes}</dd><dt>Estado</dt><dd>${a.estado.replace('_', ' ')}</dd></dl>` : ''}

    ${on('alcance') ? html`${h2('Alcance y criterios')}
      <p>${a.alcance}</p>
      <p>Se seleccionaron <strong>${i.seleccionados}</strong> controles de ISO/IEC 27002:2022 como criterios de auditoría:</p>
      <div class="table-wrap"><table><thead><tr><th>Código</th><th>Control</th><th>Criterio</th></tr></thead>
      <tbody>${c.evaluaciones.map((e) => html`<tr><td><strong>${e.codigo_iso}</strong></td><td>${e.control_nombre}</td><td>${e.criterio}</td></tr>`)}</tbody></table></div>` : ''}

    ${on('resultados') ? html`${h2('Resultados e indicadores')}
      <p>${c.resumen}</p>
      ${donut(['IMPLEMENTADO', 'PARCIAL', 'NO_IMPLEMENTADO', 'NO_APLICABLE', 'PENDIENTE'].map((k) => ({ label: ESTADOS_EVAL[k].label, color: ESTADOS_EVAL[k].color,
        value: { IMPLEMENTADO: i.implementados, PARCIAL: i.parciales, NO_IMPLEMENTADO: i.no_implementados, NO_APLICABLE: i.no_aplicables, PENDIENTE: i.pendientes }[k] })).filter((x) => x.value || x.label !== 'Pendiente'), pct(i.cumplimiento_base), 'cumplimiento')}
      <div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>Indicador</th><th>Fórmula</th><th class="num">Resultado</th></tr></thead><tbody>
        <tr><td>Cumplimiento base</td><td>${i.implementados} ÷ ${i.aplicables} × 100</td><td class="num"><strong>${pct(i.cumplimiento_base)}</strong></td></tr>
        <tr><td>Índice ponderado</td><td>(${i.implementados} + ${i.parciales} × 0,5) ÷ ${i.aplicables} × 100</td><td class="num"><strong>${pct(i.indice_ponderado)}</strong></td></tr>
        <tr><td>Controles aplicables</td><td>${i.seleccionados} seleccionados − ${i.no_aplicables} no aplicables</td><td class="num">${i.aplicables}</td></tr>
        <tr><td>Avance de evaluación</td><td>${i.evaluados} ÷ ${i.seleccionados} × 100</td><td class="num">${pct(i.avance)}</td></tr>
      </tbody></table></div>
      <p class="muted" style="font-size:12px;margin-top:.5rem">${i.formulas.aplicables}.</p>` : ''}

    ${on('evaluacion') ? html`${h2('Evaluación por control')}
      <div class="table-wrap"><table><thead><tr><th>Código</th><th>Control</th><th>Estado</th><th>Observación / justificación</th></tr></thead>
      <tbody>${c.evaluaciones.map((e) => html`<tr><td><strong>${e.codigo_iso}</strong></td><td>${e.control_nombre}</td><td>${chip(e.estado)}</td>
        <td>${e.observacion || '—'}${e.justificacion_na ? html`<br><em>Justificación N/A: ${e.justificacion_na}</em>` : ''}</td></tr>`)}</tbody></table></div>` : ''}

    ${on('hallazgos') ? html`${h2('Hallazgos')}
      ${c.hallazgos.length ? c.hallazgos.map((h) => html`<div class="finding" style="margin-bottom:.75rem">
        <div class="finding-head"><h3>${h.codigo} · Control ${h.codigo_iso} ${h.control_nombre}</h3>${chip(h.severidad)}</div>
        <dl><dt>Condición</dt><dd>${h.condicion}</dd><dt>Criterio</dt><dd>${h.criterio}</dd><dt>Causa</dt><dd>${h.causa}</dd><dt>Efecto / riesgo</dt><dd>${h.efecto_riesgo}</dd></dl></div>`)
      : html`<p>No se documentaron hallazgos.</p>`}` : ''}

    ${on('recomendaciones') ? html`${h2('Recomendaciones')}
      ${recs.length ? html`<div class="table-wrap"><table><thead><tr><th>Código</th><th>Hallazgo</th><th>Recomendación</th><th>Prioridad</th><th class="num">Plazo</th></tr></thead>
      <tbody>${recs.map((r) => html`<tr><td><strong>${r.codigo}</strong></td><td>${r.hallazgo} (${r.control})</td><td>${r.descripcion}${r.responsable ? html`<br><small>Responsable sugerido: ${r.responsable}</small>` : ''}</td><td>${chip(r.prioridad)}</td><td class="num">${r.plazo_dias} días</td></tr>`)}</tbody></table></div>`
      : html`<p>No hay recomendaciones registradas.</p>`}` : ''}

    ${on('evidencias') ? html`${h2('Anexo de evidencias')}
      ${c.evidencias.length ? html`<div class="table-wrap"><table><thead><tr><th>Código</th><th>Control</th><th>Descripción</th><th>Tipo / fuente</th><th>Fecha</th><th>Marca</th></tr></thead>
      <tbody>${c.evidencias.map((v) => html`<tr><td><strong>${v.codigo}</strong></td><td>${v.codigo_iso}</td><td>${v.descripcion}${v.referencia ? html`<br><small>Ref.: ${v.referencia}</small>` : ''}${v.archivo_nombre ? html`<br><small>Archivo: ${v.archivo_nombre}</small>` : ''}</td>
        <td>${v.tipo}<br><small>${v.fuente}</small></td><td>${fecha(v.fecha)}</td><td>${v.es_simulada ? html`<span class="chip sim">Simulada</span>` : 'Real'}</td></tr>`)}</tbody></table></div>`
      : html`<p>No hay evidencias registradas.</p>`}` : ''}

    ${h2('Limitaciones')}
    <div class="disclaimer">${c.limitaciones}</div>
    <p class="muted" style="font-size:11px;margin-top:1.5rem">Documento generado automáticamente por AuditSys Mini a partir de la información registrada en el sistema.</p>
  </article>`;
}
