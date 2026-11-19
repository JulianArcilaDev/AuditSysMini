// Encabezado y pasos del flujo guiado de una auditoría.
import { html, chip, fecha } from '../ui.js';

const PASOS = [
  ['', 'Resumen'],
  ['/controles', 'Controles'],
  ['/evaluacion', 'Evaluación'],
  ['/hallazgos', 'Hallazgos'],
  ['/trazabilidad', 'Trazabilidad'],
  ['/informe', 'Informe'],
];

export function auditHeader(aud, activo, { extra = '' } = {}) {
  const ind = aud.indicadores;
  const done = {
    '': true,
    '/controles': ind ? ind.seleccionados >= 10 : false,
    '/evaluacion': ind ? ind.seleccionados > 0 && ind.pendientes === 0 : false,
    '/hallazgos': aud.n_hallazgos >= 3,
    '/trazabilidad': aud.estado === 'CERRADA',
    '/informe': aud.n_informes > 0,
  };
  return html`
  <div class="page-head">
    <div>
      <div class="crumbs"><a href="#/auditorias">Auditorías</a> / #${aud.id_auditoria}</div>
      <h1>${aud.organizacion} ${chip(aud.estado)}</h1>
      <p>${fecha(aud.fecha_inicio)} – ${fecha(aud.fecha_fin)} · Responsable: ${aud.auditor_nombre}</p>
    </div>
    <div class="actions no-print">${extra}</div>
  </div>
  <nav class="stepper no-print" aria-label="Pasos de la auditoría">
    ${PASOS.map(([suf, label], idx) => html`<a href="#/auditorias/${aud.id_auditoria}${suf}" class="${activo === suf ? 'active' : ''} ${done[suf] && activo !== suf ? 'done' : ''}" ${activo === suf ? html`aria-current="step"` : ''}>
      <span class="n">${done[suf] && activo !== suf ? '✓' : idx + 1}</span>${label}</a>`)}
  </nav>
  ${aud.estado === 'CERRADA' ? html`<div class="notice info no-print" style="margin-bottom:1rem">Esta auditoría está <strong>cerrada</strong>: la información es de solo lectura.</div>` : ''}
  ${aud.estado === 'BORRADOR' && activo !== '' && activo !== '/controles' && activo !== '/informe' && activo !== '/trazabilidad'
    ? html`<div class="notice warn no-print" style="margin-bottom:1rem">La auditoría está en <strong>borrador</strong>. Seleccione los controles e inicie la ejecución desde el <a href="#/auditorias/${aud.id_auditoria}">resumen</a> para evaluar y registrar hallazgos.</div>` : ''}`;
}

/** Carga la auditoría con datos agregados para el encabezado. */
export async function loadAudit(api, id) {
  const [aud, hall, infs] = await Promise.all([
    api.get(`/auditorias/${id}`),
    api.get(`/auditorias/${id}/hallazgos`),
    api.get(`/auditorias/${id}/informes`),
  ]);
  aud.n_hallazgos = hall.length;
  aud.n_informes = infs.length;
  aud.hallazgos = hall;
  aud.informes = infs;
  aud.editable = aud.puede_editar && aud.estado !== 'CERRADA';
  aud.campo = aud.editable && ['EN_EJECUCION', 'EN_REVISION'].includes(aud.estado);
  return aud;
}
