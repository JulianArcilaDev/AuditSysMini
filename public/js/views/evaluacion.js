// RF03 · Evaluación de controles y RF04 · Evidencias (pantalla central del producto).
import { api } from '../api.js';
import { html, icon, chip, field, bindForm, toast, confirmDialog, modal, fecha, today, pct, ESTADOS_EVAL } from '../ui.js';
import { go, reload } from '../app.js';
import { auditHeader, loadAudit } from './shared.js';

const TIPOS = ['Documental', 'Entrevista', 'Observación', 'Técnica', 'Fotográfica'];

export async function render(el, [id, idEval]) {
  const aud = await loadAudit(api, id);
  if (!aud.evaluaciones.length) {
    el.innerHTML = html`${auditHeader(aud, '/evaluacion')}<div class="card empty"><h3>No hay controles seleccionados</h3><a class="btn" href="#/auditorias/${id}/controles">Seleccionar controles</a></div>`.s;
    return;
  }
  const actual = idEval ? Number(idEval) : (aud.evaluaciones.find((e) => e.estado === 'PENDIENTE') || aud.evaluaciones[0]).id_evaluacion;
  const ev = await api.get(`/evaluaciones/${actual}`);
  const i = aud.indicadores;
  const idx = aud.evaluaciones.findIndex((e) => e.id_evaluacion === actual);
  const siguiente = aud.evaluaciones[idx + 1];
  const anterior = aud.evaluaciones[idx - 1];
  const campo = aud.campo;
  const necesitaEvidencia = ['IMPLEMENTADO', 'PARCIAL'].includes(ev.estado) && !ev.evidencias.length;

  el.innerHTML = html`
  ${auditHeader(aud, '/evaluacion')}
  <div class="eval-layout">
    <aside class="card" style="padding:.75rem">
      <div style="padding:.25rem .5rem .75rem">
        <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.35rem"><strong>Avance</strong><span>${i.evaluados}/${i.seleccionados} · ${pct(i.avance)}</span></div>
        <div class="progress"><span style="width:${i.avance}%"></span></div>
      </div>
      <ul class="ctrl-list" aria-label="Controles de la auditoría">
        ${aud.evaluaciones.map((e) => html`<li><a href="#/auditorias/${id}/evaluacion/${e.id_evaluacion}" class="${e.id_evaluacion === actual ? 'active' : ''}" ${e.id_evaluacion === actual ? html`aria-current="true"` : ''}>
          <span class="code">${e.codigo_iso}</span><span class="name" title="${e.control_nombre}">${e.control_nombre}</span>
          <span>${chip(e.estado)} ${e.n_evidencias ? html`<small class="muted">· ${e.n_evidencias} ev.</small>` : ''} ${e.n_hallazgos ? html`<small class="muted">· ${e.n_hallazgos} hall.</small>` : ''}</span></a></li>`)}
      </ul>
    </aside>

    <section>
      <div class="card">
        <div class="card-head">
          <div><span class="muted" style="font-size:.85rem">${ev.fuente} · ${ev.categoria}</span><h2>${ev.codigo_iso} · ${ev.control_nombre}</h2></div>
          ${chip(ev.estado)}
        </div>
        <div class="criteria">
          <p><strong>Criterio:</strong> ${ev.criterio}</p>
          ${ev.pregunta ? html`<p><strong>Pregunta orientadora:</strong> ${ev.pregunta}</p>` : ''}
          ${ev.ejemplo ? html`<p><strong>Ejemplo de aplicación:</strong> ${ev.ejemplo}</p>` : ''}
          ${ev.evidencia_sugerida ? html`<p><strong>Evidencia objetiva sugerida:</strong> ${ev.evidencia_sugerida}</p>` : ''}
        </div>

        <form class="form" id="eval-form" style="margin-top:1rem">
          <div class="form-error" tabindex="-1" role="alert"></div>
          <div class="field">
            <span class="label">Estado de implementación<span class="req" aria-hidden="true">*</span></span>
            <div class="state-picker" role="radiogroup" aria-label="Estado de implementación">
              ${['IMPLEMENTADO', 'PARCIAL', 'NO_IMPLEMENTADO', 'NO_APLICABLE'].map((s) => html`<label class="s-${s}">
                <input type="radio" name="estado" value="${s}" required data-label="El estado" ${ev.estado === s ? html`checked` : ''} ${campo ? '' : html`disabled`}>
                <span class="dot" style="background:${ESTADOS_EVAL[s].color}"></span><span class="txt">${ESTADOS_EVAL[s].label}</span></label>`)}
            </div>
            <span class="field-error" data-for="estado" role="alert"></span>
          </div>
          ${field({ name: 'observacion', label: 'Observación del auditor', type: 'textarea', value: ev.observacion || '', required: true, minlength: 5, placeholder: 'Describa lo verificado y el fundamento del estado asignado…', attrs: campo ? '' : 'disabled' })}
          <div id="na-wrap" ${ev.estado === 'NO_APLICABLE' ? '' : html`hidden`}>
            ${field({ name: 'justificacion_na', label: 'Justificación de no aplicabilidad', type: 'textarea', value: ev.justificacion_na || '', required: true, minlength: 10, help: 'Obligatoria: explique por qué el control no aplica al alcance o contexto.', attrs: campo ? '' : 'disabled' })}
          </div>
          <div class="notice warn" id="ev-warn" ${necesitaEvidencia ? '' : html`hidden`}>Los estados <strong>Implementado</strong> y <strong>Parcial</strong> exigen al menos una evidencia antes de enviar la auditoría a revisión.</div>
          ${campo ? html`<div class="actions">
            <button class="btn" type="submit">Guardar evaluación</button>
            <button class="btn secondary" type="submit" data-next="1" ${siguiente ? '' : html`hidden`}>Guardar y siguiente ${icon('arrow')}</button>
          </div>` : ''}
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h3>Evidencias asociadas (${ev.evidencias.length})</h3>${campo ? html`<button class="btn secondary sm" id="add-ev">${icon('plus')} Registrar evidencia</button>` : ''}</div>
        ${ev.evidencias.length ? ev.evidencias.map((v) => html`<div class="ev-item">
          <div><strong>${v.codigo}</strong> · ${v.descripcion} ${v.es_simulada ? html`<span class="chip sim">Simulada</span>` : ''}<br>
            <small>${v.tipo} · Fuente: ${v.fuente} · ${fecha(v.fecha)}${v.referencia ? html` · Ref.: ${v.referencia}` : ''}</small>
            ${v.tiene_archivo ? html`<br><a href="/api/evidencias/${v.id_evidencia}/archivo">${icon('file')} ${v.archivo_nombre}</a>` : ''}</div>
          ${campo ? html`<button class="btn ghost sm" data-del-ev="${v.id_evidencia}" aria-label="Eliminar evidencia ${v.codigo}">${icon('trash')}</button>` : ''}
        </div>`) : html`<p class="muted">Sin evidencias registradas para este control.</p>`}
      </div>

      <div class="card">
        <div class="card-head"><h3>Hallazgos de este control (${ev.hallazgos.length})</h3>
          ${campo && ev.estado !== 'PENDIENTE' ? html`<a class="btn secondary sm" href="#/auditorias/${id}/hallazgos?evaluacion=${ev.id_evaluacion}">${icon('plus')} Documentar hallazgo</a>` : ''}</div>
        ${ev.hallazgos.length ? ev.hallazgos.map((h) => html`<div class="ev-item"><div><strong>${h.codigo}</strong> ${chip(h.severidad)} ${h.condicion}<br>
          <small>${h.recomendaciones.length ? `${h.recomendaciones.length} recomendación(es)` : html`<span class="alert-tag">Sin recomendación</span>`}</small></div></div>`)
          : html`<p class="muted">${ev.estado === 'PENDIENTE' ? 'Evalúe el control para poder documentar hallazgos.' : ev.estado === 'NO_IMPLEMENTADO' ? 'Un control No implementado normalmente debería sustentar un hallazgo.' : 'Sin hallazgos.'}</p>`}
      </div>

      <div class="actions" style="justify-content:space-between;margin-top:1rem">
        ${anterior ? html`<a class="btn ghost" href="#/auditorias/${id}/evaluacion/${anterior.id_evaluacion}">${icon('back')} ${anterior.codigo_iso}</a>` : html`<span></span>`}
        ${siguiente ? html`<a class="btn ghost" href="#/auditorias/${id}/evaluacion/${siguiente.id_evaluacion}">${siguiente.codigo_iso} ${icon('arrow')}</a>` : html`<a class="btn ghost" href="#/auditorias/${id}/hallazgos">Ir a hallazgos ${icon('arrow')}</a>`}
      </div>
    </section>
  </div>`.s;

  if (!campo) return;
  const form = el.querySelector('#eval-form');
  const naWrap = el.querySelector('#na-wrap');
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'estado') return;
    naWrap.hidden = e.target.value !== 'NO_APLICABLE';
    el.querySelector('#ev-warn').hidden = !(['IMPLEMENTADO', 'PARCIAL'].includes(e.target.value) && !ev.evidencias.length);
  });
  let irSiguiente = false;
  form.querySelectorAll('[type=submit]').forEach((b) => b.addEventListener('click', () => { irSiguiente = !!b.dataset.next; }));
  bindForm(form, async (data) => {
    const r = await api.put(`/evaluaciones/${actual}`, data);
    toast(`Control ${ev.codigo_iso} evaluado.`);
    r.advertencias?.forEach((a) => toast(a, 'err'));
    if (irSiguiente && siguiente) go(`/auditorias/${id}/evaluacion/${siguiente.id_evaluacion}`);
    else reload();
  });

  el.querySelector('#add-ev').addEventListener('click', () => evidenciaModal(actual, ev));
  el.querySelectorAll('[data-del-ev]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('¿Eliminar esta evidencia? Se perderá su asociación con el control.', { ok: 'Eliminar', danger: true }))) return;
    await api.del(`/evidencias/${b.dataset.delEv}`);
    toast('Evidencia eliminada.');
    reload();
  }));
}

function evidenciaModal(idEval, ev) {
  const dlg = modal(`Registrar evidencia · ${ev.codigo_iso}`, html`
    <form class="form" id="ev-form">
      <div class="form-error" tabindex="-1" role="alert"></div>
      ${ev.evidencia_sugerida ? html`<div class="notice info">Sugerida por el catálogo: ${ev.evidencia_sugerida}</div>` : ''}
      ${field({ name: 'descripcion', label: 'Descripción', type: 'textarea', required: true, minlength: 5, rows: 2, placeholder: 'Ej.: Política de seguridad v2.0 aprobada por gerencia' })}
      <div class="form-row">
        ${field({ name: 'tipo', label: 'Tipo', type: 'select', required: true, value: 'Documental', options: TIPOS.map((t) => ({ value: t, label: t })) })}
        ${field({ name: 'fecha', label: 'Fecha de obtención', type: 'date', required: true, value: today() })}
      </div>
      ${field({ name: 'fuente', label: 'Fuente', required: true, minlength: 2, placeholder: 'Ej.: Líder de TI, Gerencia, Consola antimalware' })}
      ${field({ name: 'referencia', label: 'Referencia documental', placeholder: 'Código, ruta o URL (obligatoria si no adjunta archivo)' })}
      <div class="field"><label for="ev-file">Archivo (opcional)</label><input type="file" id="ev-file" name="archivo" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.pptx">
        <span class="help">PDF, imagen u ofimática · máx. 5 MB.</span><span class="field-error" data-for="archivo" role="alert"></span></div>
      <label class="checkbox"><input type="checkbox" name="es_simulada" checked> Evidencia simulada (ejercicio académico)</label>
      <div class="actions" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" type="submit">Guardar evidencia</button></div>
    </form>`);
  const form = dlg.querySelector('#ev-form');
  bindForm(form, async (data) => {
    const file = form.querySelector('#ev-file').files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) throw Object.assign(new Error('Revise los campos marcados.'), { fields: { archivo: 'El archivo supera 5 MB.' } });
      data.archivo = { nombre: file.name, datos: await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }) };
    } else if (!data.referencia) {
      throw Object.assign(new Error('Revise los campos marcados.'), { fields: { referencia: 'Indique una referencia documental o adjunte un archivo.' } });
    }
    const r = await api.post(`/evaluaciones/${idEval}/evidencias`, data);
    toast(`Evidencia ${r.codigo} registrada.`);
    dlg.close();
    reload();
  });
}
