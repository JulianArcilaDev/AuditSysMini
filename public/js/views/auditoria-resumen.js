// Resumen de la auditoría: datos generales, indicadores (RF07) y ciclo de vida.
import { api } from '../api.js';
import { html, icon, pct, fecha, fechaHora, stackbar, toast, confirmDialog, ESTADOS_AUD, ESTADOS_EVAL } from '../ui.js';
import { go, reload } from '../app.js';
import { auditHeader, loadAudit } from './shared.js';

const SIGUIENTE = {
  BORRADOR: ['EN_EJECUCION', 'Iniciar ejecución', 'Requiere entre 10 y 15 controles seleccionados.'],
  EN_EJECUCION: ['EN_REVISION', 'Enviar a revisión', 'Requiere todos los controles evaluados y evidencia en los Implementados/Parciales.'],
  EN_REVISION: ['CERRADA', 'Cerrar auditoría', 'Requiere al menos 3 hallazgos, cada uno con recomendación. Al cerrar, la auditoría queda en solo lectura.'],
};
const ANTERIOR = { EN_EJECUCION: 'BORRADOR', EN_REVISION: 'EN_EJECUCION' };

export async function render(el, [id]) {
  const aud = await loadAudit(api, id);
  const i = aud.indicadores;
  const sig = SIGUIENTE[aud.estado];
  const verif = sig ? await api.get(`/auditorias/${id}/verificar?destino=${sig[0]}`) : null;

  el.innerHTML = html`
  ${auditHeader(aud, '', { extra: aud.editable ? html`<a class="btn secondary" href="#/auditorias/${id}/editar">${icon('edit')} Editar datos</a>` : '' })}
  <div class="grid grid-3">
    <div class="card span-2">
      <div class="card-head"><h2>Datos generales</h2></div>
      <dl class="kv">
        <dt>Organización</dt><dd>${aud.organizacion}</dd>
        <dt>Objetivo</dt><dd>${aud.objetivo}</dd>
        <dt>Alcance</dt><dd>${aud.alcance}</dd>
        <dt>Periodo</dt><dd>${fecha(aud.fecha_inicio)} – ${fecha(aud.fecha_fin)}</dd>
        <dt>Auditor responsable</dt><dd>${aud.auditor_nombre} <small>(${aud.auditor_correo})</small></dd>
        <dt>Referentes</dt><dd>${aud.referentes}</dd>
        <dt>Última actualización</dt><dd>${fechaHora(aud.actualizado_en)}</dd>
      </dl>
    </div>
    <div class="card">
      <div class="card-head"><h2>Ciclo de vida</h2></div>
      <ol style="padding-left:1.2rem;margin:0 0 1rem">
        ${Object.entries(ESTADOS_AUD).map(([k, v]) => html`<li style="${k === aud.estado ? 'font-weight:700;color:var(--primary)' : 'color:var(--muted)'}">${v}${k === aud.estado ? ' ← actual' : ''}</li>`)}
      </ol>
      ${sig && aud.puede_editar ? html`
        <p class="muted" style="font-size:.85rem">${sig[2]}</p>
        ${verif.problemas.length ? html`<div class="notice warn" style="margin-bottom:.75rem"><strong>Pendiente para continuar:</strong><ul>${verif.problemas.map((p) => html`<li>${p}</li>`)}</ul></div>` : html`<div class="notice info" style="margin-bottom:.75rem">✓ Cumple los requisitos para pasar a <strong>${ESTADOS_AUD[sig[0]]}</strong>.</div>`}
        <div class="actions">
          <button class="btn" id="next" ${verif.problemas.length ? html`disabled` : ''}>${sig[1]} ${icon('arrow')}</button>
          ${ANTERIOR[aud.estado] ? html`<button class="btn ghost" id="prev">Volver a ${ESTADOS_AUD[ANTERIOR[aud.estado]]}</button>` : ''}
        </div>` : ''}
      ${aud.estado === 'CERRADA' ? html`<p>La auditoría fue cerrada. Puede consultar la <a href="#/auditorias/${id}/trazabilidad">trazabilidad</a> y generar el <a href="#/auditorias/${id}/informe">informe</a>.</p>` : ''}
      ${aud.estado === 'BORRADOR' && aud.puede_editar ? html`<hr style="border:0;border-top:1px solid var(--border);margin:1rem 0"><button class="btn danger sm" id="del">${icon('trash')} Eliminar borrador</button>` : ''}
    </div>
  </div>

  <div class="card" style="margin-top:1rem">
    <div class="card-head"><h2>Resultados e indicadores</h2><a href="#/auditorias/${id}/evaluacion">Ir a evaluación →</a></div>
    ${i.seleccionados ? html`
      ${stackbar(i)}
      <div class="grid grid-4" style="margin-top:1rem">
        ${['IMPLEMENTADO', 'PARCIAL', 'NO_IMPLEMENTADO', 'NO_APLICABLE'].map((k) => html`<div><span class="chip ${k}">${ESTADOS_EVAL[k].label}</span>
          <div style="font-size:1.6rem;font-weight:700">${{ IMPLEMENTADO: i.implementados, PARCIAL: i.parciales, NO_IMPLEMENTADO: i.no_implementados, NO_APLICABLE: i.no_aplicables }[k]}</div></div>`)}
      </div>
      <div class="grid grid-3" style="margin-top:1rem">
        <div class="card kpi"><div class="label">Cumplimiento base</div><div class="value">${pct(i.cumplimiento_base)}</div><div class="hint">${i.implementados} ÷ ${i.aplicables} × 100</div></div>
        <div class="card kpi"><div class="label">Índice ponderado</div><div class="value">${pct(i.indice_ponderado)}</div><div class="hint">(${i.implementados} + ${i.parciales} × 0,5) ÷ ${i.aplicables} × 100</div></div>
        <div class="card kpi"><div class="label">Avance de evaluación</div><div class="value">${pct(i.avance)}</div><div class="hint">${i.evaluados} de ${i.seleccionados} evaluados · ${i.pendientes} pendientes</div></div>
      </div>
      <div class="formula" style="margin-top:1rem"><strong>Fórmula:</strong> ${i.formulas.base}. ${i.formulas.aplicables}. El resultado es descriptivo, no equivale a una certificación ni sustituye el juicio profesional del auditor.</div>`
    : html`<div class="empty"><h3>Sin controles seleccionados</h3><p>Seleccione entre 10 y 15 controles del catálogo.</p><a class="btn" href="#/auditorias/${id}/controles">Seleccionar controles</a></div>`}
  </div>`.s;

  const cambiar = async (estado, msg) => {
    try {
      await api.post(`/auditorias/${id}/estado`, { estado });
      toast(msg);
      reload();
    } catch (err) {
      toast(err.problemas ? `${err.message} ${err.problemas.join(' ')}` : err.message, 'err');
    }
  };
  el.querySelector('#next')?.addEventListener('click', async () => {
    if (sig[0] === 'CERRADA' && !(await confirmDialog('Al cerrar la auditoría no se podrán modificar evaluaciones, evidencias ni hallazgos. ¿Desea continuar?', { ok: 'Cerrar auditoría' }))) return;
    cambiar(sig[0], `Auditoría en estado ${ESTADOS_AUD[sig[0]]}.`);
  });
  el.querySelector('#prev')?.addEventListener('click', () => cambiar(ANTERIOR[aud.estado], `Auditoría devuelta a ${ESTADOS_AUD[ANTERIOR[aud.estado]]}.`));
  el.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmDialog('¿Eliminar definitivamente este borrador de auditoría? Esta acción no se puede deshacer.', { ok: 'Eliminar', danger: true }))) return;
    await api.del(`/auditorias/${id}`);
    toast('Borrador eliminado.');
    go('/auditorias');
  });
}
