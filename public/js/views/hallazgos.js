// RF05 · Hallazgos y RF06 · Recomendaciones asociadas.
import { api } from '../api.js';
import { html, icon, chip, field, bindForm, toast, confirmDialog, modal, SEVERIDAD } from '../ui.js';
import { reload, query } from '../app.js';
import { auditHeader, loadAudit } from './shared.js';

const SEV_OPTS = ['ALTA', 'MEDIA', 'BAJA'].map((s) => ({ value: s, label: SEVERIDAD[s].label }));

export async function render(el, [id]) {
  const aud = await loadAudit(api, id);
  const campo = aud.campo;
  const evaluados = aud.evaluaciones.filter((e) => e.estado !== 'PENDIENTE');
  const hs = aud.hallazgos;
  const porSev = { ALTA: 0, MEDIA: 0, BAJA: 0 };
  hs.forEach((h) => porSev[h.severidad]++);
  const sinRec = hs.filter((h) => !h.recomendaciones.length).length;
  const noImplSinH = aud.evaluaciones.filter((e) => e.estado === 'NO_IMPLEMENTADO' && !e.n_hallazgos);

  el.innerHTML = html`
  ${auditHeader(aud, '/hallazgos', { extra: campo ? html`<button class="btn" id="nuevo">${icon('plus')} Nuevo hallazgo</button>` : '' })}
  <div class="grid grid-4" style="margin-bottom:1rem">
    <div class="card kpi"><div class="label">Hallazgos</div><div class="value">${hs.length}</div><div class="hint">Mínimo 3 para cerrar</div></div>
    <div class="card kpi"><div class="label">Severidad alta</div><div class="value">${porSev.ALTA}</div><div class="hint">Media ${porSev.MEDIA} · Baja ${porSev.BAJA}</div></div>
    <div class="card kpi"><div class="label">Recomendaciones</div><div class="value">${hs.reduce((s, h) => s + h.recomendaciones.length, 0)}</div><div class="hint">${sinRec} hallazgo(s) sin recomendación</div></div>
    <div class="card kpi"><div class="label">No implementados sin hallazgo</div><div class="value">${noImplSinH.length}</div><div class="hint">${noImplSinH.map((e) => e.codigo_iso).join(', ') || 'Ninguno'}</div></div>
  </div>
  ${!evaluados.length ? html`<div class="notice warn">Evalúe al menos un control antes de documentar hallazgos.</div>` : ''}
  <div id="list">
  ${hs.length ? hs.map((h) => html`<article class="finding" id="h-${h.id_hallazgo}">
    <div class="finding-head">
      <h3>${h.codigo} · Control ${h.codigo_iso} ${h.control_nombre}</h3>
      ${chip(h.severidad)} ${chip(h.estado_control)}
      ${campo ? html`<button class="btn ghost sm" data-edit="${h.id_hallazgo}">${icon('edit')} Editar</button><button class="btn ghost sm" data-del="${h.id_hallazgo}" aria-label="Eliminar ${h.codigo}">${icon('trash')}</button>` : ''}
    </div>
    <dl>
      <dt>Condición</dt><dd>${h.condicion}</dd>
      <dt>Criterio</dt><dd>${h.criterio}</dd>
      <dt>Causa</dt><dd>${h.causa}</dd>
      <dt>Efecto / riesgo</dt><dd>${h.efecto_riesgo}</dd>
    </dl>
    ${h.recomendaciones.map((r) => html`<div class="rec">
      <div style="display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap"><strong>${r.codigo} · Recomendación</strong>
        <span>${chip(r.prioridad)} <span class="chip plain">${r.plazo_dias} días</span>
        ${campo ? html`<button class="btn ghost sm" data-edit-rec="${r.id_recomendacion}" data-h="${h.id_hallazgo}">${icon('edit')}</button><button class="btn ghost sm" data-del-rec="${r.id_recomendacion}" aria-label="Eliminar ${r.codigo}">${icon('trash')}</button>` : ''}</span></div>
      <p style="margin:.35rem 0 0">${r.descripcion}</p>${r.responsable ? html`<small>Responsable sugerido: ${r.responsable}</small>` : ''}</div>`)}
    ${!h.recomendaciones.length ? html`<div class="rec" style="background:#fdf1f1;border-color:#f0c4c4"><span class="alert-tag">Sin recomendación</span> Todo hallazgo debe tener al menos una recomendación para cerrar la auditoría.</div>` : ''}
    ${campo ? html`<div style="padding:0 1rem 1rem"><button class="btn secondary sm" data-add-rec="${h.id_hallazgo}">${icon('plus')} Agregar recomendación</button></div>` : ''}
  </article>`) : html`<div class="card empty"><h3>Sin hallazgos documentados</h3><p>Documente al menos tres hallazgos sustentados en la evaluación (condición, criterio, causa, efecto).</p></div>`}
  </div>`.s;

  if (!campo) return;
  const byId = (hid) => hs.find((h) => h.id_hallazgo === Number(hid));
  el.querySelector('#nuevo').addEventListener('click', () => hallazgoModal(evaluados));
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => hallazgoModal(evaluados, byId(b.dataset.edit))));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const h = byId(b.dataset.del);
    if (!(await confirmDialog(`¿Eliminar el hallazgo ${h.codigo} y sus recomendaciones?`, { ok: 'Eliminar', danger: true }))) return;
    await api.del(`/hallazgos/${h.id_hallazgo}`);
    toast(`Hallazgo ${h.codigo} eliminado.`);
    reload();
  }));
  el.querySelectorAll('[data-add-rec]').forEach((b) => b.addEventListener('click', () => recModal(byId(b.dataset.addRec))));
  el.querySelectorAll('[data-edit-rec]').forEach((b) => b.addEventListener('click', () => {
    const h = byId(b.dataset.h);
    recModal(h, h.recomendaciones.find((r) => r.id_recomendacion === Number(b.dataset.editRec)));
  }));
  el.querySelectorAll('[data-del-rec]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('¿Eliminar esta recomendación?', { ok: 'Eliminar', danger: true }))) return;
    await api.del(`/recomendaciones/${b.dataset.delRec}`);
    toast('Recomendación eliminada.');
    reload();
  }));
  const pre = query().get('evaluacion');
  if (pre && evaluados.some((e) => String(e.id_evaluacion) === pre)) {
    history.replaceState(null, '', `#/auditorias/${id}/hallazgos`);
    hallazgoModal(evaluados, null, Number(pre));
  }
}

const recFields = (r = {}) => html`
  ${field({ name: 'rec_descripcion', label: 'Recomendación', type: 'textarea', value: r.descripcion || '', minlength: 10, rows: 2, placeholder: 'Acción sugerida para corregir la causa…', attrs: 'data-rec' })}
  <div class="form-row">
    ${field({ name: 'rec_prioridad', label: 'Prioridad', type: 'select', value: r.prioridad || 'ALTA', options: SEV_OPTS })}
    ${field({ name: 'rec_plazo_dias', label: 'Plazo sugerido (días)', type: 'number', value: r.plazo_dias || 60, min: 1, max: 730 })}
  </div>
  ${field({ name: 'rec_responsable', label: 'Responsable sugerido', value: r.responsable || '', placeholder: 'Opcional' })}`;

const recBody = (d) => ({ descripcion: d.rec_descripcion, prioridad: d.rec_prioridad, plazo_dias: d.rec_plazo_dias, responsable: d.rec_responsable });
const mapRecErrors = (err) => {
  if (err.fields) err.fields = Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [['condicion', 'criterio', 'causa', 'efecto_riesgo', 'severidad', 'id_evaluacion'].includes(k) ? k : `rec_${k}`, v]));
  return err;
};

function hallazgoModal(evaluados, h = null, preEval = null) {
  const defEval = h?.id_evaluacion || preEval || evaluados.find((e) => e.estado === 'NO_IMPLEMENTADO' && !e.n_hallazgos)?.id_evaluacion || evaluados[0]?.id_evaluacion;
  const crit = (e) => `ISO/IEC 27002:2022, control ${e.codigo_iso} – ${e.control_nombre}: ${e.criterio}`;
  const dlg = modal(h ? `Editar hallazgo ${h.codigo}` : 'Nuevo hallazgo', html`
    <form class="form" id="h-form">
      <div class="form-error" tabindex="-1" role="alert"></div>
      <div class="form-row">
        ${h ? html`<div class="field"><span class="label">Control asociado</span><input value="${h.codigo_iso} · ${h.control_nombre}" disabled></div>`
          : field({ name: 'id_evaluacion', label: 'Control asociado', type: 'select', required: true, value: defEval, options: evaluados.map((e) => ({ value: e.id_evaluacion, label: `${e.codigo_iso} · ${e.control_nombre} (${e.estado.replace('_', ' ').toLowerCase()})` })) })}
        ${field({ name: 'severidad', label: 'Severidad', type: 'select', required: true, value: h?.severidad || 'ALTA', options: SEV_OPTS })}
      </div>
      ${field({ name: 'condicion', label: 'Condición (lo que se encontró)', type: 'textarea', required: true, minlength: 10, value: h?.condicion || '', rows: 2 })}
      ${field({ name: 'criterio', label: 'Criterio (lo que debería ser)', type: 'textarea', required: true, minlength: 10, value: h?.criterio || crit(evaluados.find((e) => e.id_evaluacion === defEval)), rows: 2, help: 'Prellenado desde el catálogo; ajústelo si es necesario.' })}
      ${field({ name: 'causa', label: 'Causa o explicación', type: 'textarea', required: true, minlength: 5, value: h?.causa || '', rows: 2 })}
      ${field({ name: 'efecto_riesgo', label: 'Efecto o riesgo', type: 'textarea', required: true, minlength: 10, value: h?.efecto_riesgo || '', rows: 2 })}
      ${!h ? html`<fieldset><legend>Recomendación asociada</legend><div class="form">${recFields()}</div></fieldset>` : ''}
      <div class="actions" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" type="submit">${h ? 'Guardar cambios' : 'Registrar hallazgo'}</button></div>
    </form>`);
  const form = dlg.querySelector('#h-form');
  const selEval = form.elements.id_evaluacion;
  selEval?.addEventListener('change', () => {
    const e = evaluados.find((x) => x.id_evaluacion === Number(selEval.value));
    form.elements.criterio.value = crit(e);
  });
  bindForm(form, async (d) => {
    const body = { condicion: d.condicion, criterio: d.criterio, causa: d.causa, efecto_riesgo: d.efecto_riesgo, severidad: d.severidad };
    try {
      if (h) {
        await api.put(`/hallazgos/${h.id_hallazgo}`, body);
        toast(`Hallazgo ${h.codigo} actualizado.`);
      } else {
        if (d.rec_descripcion) body.recomendacion = recBody(d);
        const r = await api.post(`/evaluaciones/${d.id_evaluacion}/hallazgos`, body);
        toast(`Hallazgo ${r.codigo} registrado${r.recomendacion ? ` con recomendación ${r.recomendacion.codigo}` : ' (falta recomendación)'}.`, r.recomendacion ? 'ok' : 'err');
      }
    } catch (err) { throw mapRecErrors(err); }
    dlg.close();
    reload();
  });
}

function recModal(h, r = null) {
  const dlg = modal(r ? `Editar ${r.codigo}` : `Recomendación para ${h.codigo}`, html`
    <form class="form" id="r-form">
      <div class="form-error" tabindex="-1" role="alert"></div>
      <div class="notice info"><strong>${h.codigo}:</strong> ${h.condicion}</div>
      ${recFields(r || {})}
      <div class="actions" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" type="submit">Guardar</button></div>
    </form>`);
  const form = dlg.querySelector('#r-form');
  form.elements.rec_descripcion.required = true;
  bindForm(form, async (d) => {
    try {
      if (r) await api.put(`/recomendaciones/${r.id_recomendacion}`, recBody(d));
      else await api.post(`/hallazgos/${h.id_hallazgo}/recomendaciones`, recBody(d));
    } catch (err) { throw mapRecErrors(err); }
    toast('Recomendación guardada.');
    dlg.close();
    reload();
  });
}
