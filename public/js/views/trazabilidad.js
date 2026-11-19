// RNF05 · Matriz de trazabilidad: auditoría → control → evaluación → evidencia → hallazgo → recomendación → informe.
import { api } from '../api.js';
import { html, chip } from '../ui.js';
import { auditHeader, loadAudit } from './shared.js';

export async function render(el, [id]) {
  const [aud, t] = await Promise.all([loadAudit(api, id), api.get(`/auditorias/${id}/trazabilidad`)]);
  const conAlertas = t.filas.filter((f) => f.alertas.length).length;
  el.innerHTML = html`
  ${auditHeader(aud, '/trazabilidad')}
  <div class="card">
    <div class="card-head"><div><h2>Matriz de trazabilidad</h2><p class="muted" style="margin:0">Cada evidencia y hallazgo se relaciona con su control y su auditoría. Las alertas señalan vacíos en la cadena.</p></div>
      ${conAlertas ? html`<span class="alert-tag" style="font-size:.85rem">${conAlertas} control(es) con alertas</span>` : html`<span class="ok-tag">✓ Cadena completa</span>`}</div>
    <div class="table-wrap"><table class="trace">
      <thead><tr><th>Control</th><th>Evaluación</th><th>Evidencias</th><th>Hallazgos</th><th>Recomendaciones</th><th>Alertas</th></tr></thead>
      <tbody>${t.filas.map((f) => html`<tr>
        <td><a href="#/auditorias/${id}/evaluacion/${f.id_evaluacion}"><strong>${f.codigo_iso}</strong></a><br><small>${f.control_nombre}</small></td>
        <td>${chip(f.estado)}</td>
        <td>${f.evidencias.length ? html`<ul>${f.evidencias.map((v) => html`<li><strong>${v.codigo}</strong> ${v.descripcion}${v.es_simulada ? ' (sim.)' : ''}</li>`)}</ul>` : html`<span class="muted">—</span>`}</td>
        <td>${f.hallazgos.length ? f.hallazgos.map((h) => html`<div>${h.codigo} ${chip(h.severidad)}</div>`) : html`<span class="muted">—</span>`}</td>
        <td>${f.hallazgos.flatMap((h) => h.recomendaciones).length ? html`<ul>${f.hallazgos.flatMap((h) => h.recomendaciones.map((r) => html`<li><strong>${r.codigo}</strong> ← ${h.codigo}</li>`))}</ul>` : html`<span class="muted">—</span>`}</td>
        <td>${f.alertas.length ? f.alertas.map((a) => html`<span class="alert-tag">${a}</span>`) : html`<span class="ok-tag">✓</span>`}</td>
      </tr>`)}</tbody>
    </table></div>
    <p style="margin:1rem 0 0" class="muted">Informes generados: ${t.informes.length ? t.informes.map((i, k) => html`${k ? ', ' : ''}<a href="#/informes/${i.id_informe}">versión ${i.version}</a>`) : 'ninguno'}.</p>
  </div>`.s;
}
