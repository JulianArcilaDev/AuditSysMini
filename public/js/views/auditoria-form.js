// RF01 · Registrar / editar auditoría.
import { api } from '../api.js';
import { html, field, bindForm, toast, today } from '../ui.js';
import { go } from '../app.js';

export async function render(el, [id], { user }) {
  const aud = id ? await api.get(`/auditorias/${id}`) : null;
  if (aud && (!aud.puede_editar || aud.estado === 'CERRADA')) {
    el.innerHTML = html`<div class="notice danger">No puede editar esta auditoría (no es el responsable o está cerrada).</div>`.s;
    return;
  }
  const usuarios = user.rol === 'admin' ? (await api.get('/usuarios')).filter((u) => u.activo) : [];
  const v = aud || { organizacion: '', objetivo: '', alcance: '', referentes: 'ISO 19011:2018; ISO/IEC 27001:2022; ISO/IEC 27002:2022', fecha_inicio: today(), fecha_fin: '', id_auditor: user.id_usuario };

  el.innerHTML = html`
  <div class="page-head"><div>
    <div class="crumbs"><a href="#/auditorias">Auditorías</a> / ${aud ? html`<a href="#/auditorias/${aud.id_auditoria}">#${aud.id_auditoria}</a> / Editar` : 'Nueva'}</div>
    <h1>${aud ? 'Editar auditoría' : 'Nueva auditoría'}</h1>
    <p>Datos generales: organización, objetivo, alcance, fechas y auditor responsable. Los campos con <span style="color:var(--bad)">*</span> son obligatorios.</p>
  </div></div>
  <form class="card form" id="aud-form" style="max-width:860px">
    <div class="form-error" tabindex="-1" role="alert"></div>
    ${field({ name: 'organizacion', label: 'Organización auditada', value: v.organizacion, required: true, minlength: 2, placeholder: 'Ej.: Empresa ABC (ficticia)' })}
    ${field({ name: 'objetivo', label: 'Objetivo de la auditoría', type: 'textarea', value: v.objetivo, required: true, minlength: 10, placeholder: 'Evaluar el estado de implementación de los controles seleccionados…' })}
    ${field({ name: 'alcance', label: 'Alcance', type: 'textarea', value: v.alcance, required: true, minlength: 10, placeholder: 'Procesos, sistemas, sedes y usuarios incluidos…' })}
    <div class="form-row">
      ${field({ name: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', value: v.fecha_inicio, required: true })}
      ${field({ name: 'fecha_fin', label: 'Fecha de cierre', type: 'date', value: v.fecha_fin, required: true, attrs: 'data-after="fecha_inicio" data-after-msg="La fecha de cierre debe ser igual o posterior a la de inicio."' })}
    </div>
    <div class="form-row">
      ${user.rol === 'admin'
        ? field({ name: 'id_auditor', label: 'Auditor responsable', type: 'select', value: v.id_auditor, required: true, options: usuarios.map((u) => ({ value: u.id_usuario, label: `${u.nombre} (${u.rol})` })) })
        : html`<div class="field"><span class="label">Auditor responsable</span><input value="${aud ? aud.auditor_nombre : user.nombre}" disabled><span class="help">Asignado automáticamente al usuario que registra.</span></div>`}
      ${field({ name: 'referentes', label: 'Referentes normativos', value: v.referentes, help: 'Criterios de auditoría utilizados.' })}
    </div>
    <div class="actions">
      <button class="btn" type="submit">${aud ? 'Guardar cambios' : 'Guardar como borrador'}</button>
      <a class="btn secondary" href="#${aud ? `/auditorias/${aud.id_auditoria}` : '/auditorias'}">Cancelar</a>
    </div>
  </form>`.s;

  bindForm(el.querySelector('#aud-form'), async (data) => {
    const saved = aud ? await api.put(`/auditorias/${aud.id_auditoria}`, data) : await api.post('/auditorias', data);
    toast(aud ? 'Auditoría actualizada.' : 'Auditoría creada en estado Borrador.');
    go(aud ? `/auditorias/${saved.id_auditoria}` : `/auditorias/${saved.id_auditoria}/controles`);
  });
}
