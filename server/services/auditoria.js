// Lógica de negocio: indicadores (RF07), reglas de transición de estado y consolidado del informe (RF08).
import { getDb } from '../db.js';
import { HttpError, MIN_CONTROLES, MAX_CONTROLES, MIN_HALLAZGOS } from '../validators.js';

export const FORMULAS = {
  base: 'Cumplimiento base = (Implementados ÷ Aplicables) × 100',
  ponderado: 'Índice ponderado = ((Implementados × 1) + (Parciales × 0,5)) ÷ Aplicables × 100',
  aplicables: 'Aplicables = Total evaluados − No aplicables (los "No aplicable" se excluyen del denominador)',
  avance: 'Avance = Controles evaluados ÷ Controles seleccionados × 100',
};

export const LIMITACIONES =
  'Los indicadores son descriptivos y se calculan exclusivamente a partir de los estados registrados por el auditor. ' +
  'No constituyen una certificación ni una declaración de conformidad con ISO/IEC 27001:2022, y no sustituyen el juicio ' +
  'profesional del auditor. El índice ponderado asigna 0,5 a los controles parciales como convención académica.';

const round1 = (n) => Math.round(n * 10) / 10;

/** Calcula indicadores a partir de una lista de estados. */
export function calcularIndicadores(estados) {
  const c = { IMPLEMENTADO: 0, PARCIAL: 0, NO_IMPLEMENTADO: 0, NO_APLICABLE: 0, PENDIENTE: 0 };
  for (const e of estados) c[e] = (c[e] || 0) + 1;
  const seleccionados = estados.length;
  const evaluados = seleccionados - c.PENDIENTE;
  const aplicables = c.IMPLEMENTADO + c.PARCIAL + c.NO_IMPLEMENTADO;
  return {
    seleccionados,
    evaluados,
    pendientes: c.PENDIENTE,
    implementados: c.IMPLEMENTADO,
    parciales: c.PARCIAL,
    no_implementados: c.NO_IMPLEMENTADO,
    no_aplicables: c.NO_APLICABLE,
    aplicables,
    cumplimiento_base: aplicables ? round1((100 * c.IMPLEMENTADO) / aplicables) : null,
    indice_ponderado: aplicables ? round1((100 * (c.IMPLEMENTADO + 0.5 * c.PARCIAL)) / aplicables) : null,
    avance: seleccionados ? round1((100 * evaluados) / seleccionados) : 0,
    formulas: FORMULAS,
  };
}

export function getAuditoria(id) {
  const a = getDb().prepare(`
    SELECT a.*, u.nombre AS auditor_nombre, u.correo AS auditor_correo
    FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_auditor WHERE a.id_auditoria = ?`).get(id);
  if (!a) throw new HttpError(404, 'Auditoría no encontrada.');
  return a;
}

/** RNF04: solo el auditor responsable o un admin pueden modificar; una auditoría cerrada es de solo lectura. */
export function assertEditable(aud, user, { allowClosed = false } = {}) {
  if (user.rol !== 'admin' && aud.id_auditor !== user.id_usuario)
    throw new HttpError(403, 'Acceso denegado: solo el auditor responsable o un administrador puede modificar esta auditoría.');
  if (!allowClosed && aud.estado === 'CERRADA')
    throw new HttpError(409, 'La auditoría está CERRADA y no admite modificaciones.');
}

export function getEvaluaciones(idAuditoria) {
  return getDb().prepare(`
    SELECT e.*, c.codigo_iso, c.nombre AS control_nombre, c.categoria, c.criterio, c.pregunta, c.evidencia_sugerida, c.fuente,
      (SELECT COUNT(*) FROM evidencia v WHERE v.id_evaluacion = e.id_evaluacion) AS n_evidencias,
      (SELECT COUNT(*) FROM hallazgo h WHERE h.id_evaluacion = e.id_evaluacion) AS n_hallazgos
    FROM evaluacion_control e JOIN control c ON c.id_control = e.id_control
    WHERE e.id_auditoria = ?
    ORDER BY CAST(substr(c.codigo_iso,1,1) AS INT), CAST(substr(c.codigo_iso,3) AS INT)`).all(idAuditoria);
}

export function getHallazgos(idAuditoria) {
  const db = getDb();
  const hs = db.prepare(`
    SELECT h.*, c.codigo_iso, c.nombre AS control_nombre, e.estado AS estado_control
    FROM hallazgo h JOIN evaluacion_control e ON e.id_evaluacion = h.id_evaluacion
    JOIN control c ON c.id_control = e.id_control
    WHERE h.id_auditoria = ? ORDER BY h.codigo`).all(idAuditoria);
  const recs = db.prepare('SELECT * FROM recomendacion WHERE id_hallazgo = ? ORDER BY codigo');
  return hs.map((h) => ({ ...h, recomendaciones: recs.all(h.id_hallazgo) }));
}

export function getEvidencias(idAuditoria) {
  return getDb().prepare(`
    SELECT v.*, c.codigo_iso, c.nombre AS control_nombre, e.estado AS estado_control
    FROM evidencia v JOIN evaluacion_control e ON e.id_evaluacion = v.id_evaluacion
    JOIN control c ON c.id_control = e.id_control
    WHERE e.id_auditoria = ? ORDER BY CAST(substr(v.codigo,4) AS INT)`).all(idAuditoria);
}

/**
 * Verifica las reglas para pasar al estado destino. Devuelve lista de problemas (vacía = OK).
 *  - EN_EJECUCION: entre 10 y 15 controles seleccionados (CP-03).
 *  - EN_REVISION: todos evaluados; Implementado/Parcial con ≥1 evidencia (CP-06).
 *  - CERRADA: ≥3 hallazgos y cada hallazgo con ≥1 recomendación (CP-08).
 */
export function verificarTransicion(aud, destino) {
  const evals = getEvaluaciones(aud.id_auditoria);
  const problemas = [];
  const orden = ['BORRADOR', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA'];
  const iDest = orden.indexOf(destino);
  if (iDest < 0) return ['Estado destino no válido.'];
  if (aud.estado === 'CERRADA') return ['La auditoría ya está cerrada.'];

  if (iDest >= 1) {
    if (evals.length < MIN_CONTROLES || evals.length > MAX_CONTROLES)
      problemas.push(`Debe seleccionar entre ${MIN_CONTROLES} y ${MAX_CONTROLES} controles (actualmente ${evals.length}).`);
  }
  if (iDest >= 2) {
    const pend = evals.filter((e) => e.estado === 'PENDIENTE');
    if (pend.length) problemas.push(`Hay ${pend.length} control(es) sin evaluar: ${pend.map((e) => e.codigo_iso).join(', ')}.`);
    const sinEv = evals.filter((e) => ['IMPLEMENTADO', 'PARCIAL'].includes(e.estado) && e.n_evidencias === 0);
    if (sinEv.length)
      problemas.push(`Los controles Implementado/Parcial requieren al menos una evidencia: ${sinEv.map((e) => e.codigo_iso).join(', ')}.`);
  }
  if (iDest >= 3) {
    const hs = getHallazgos(aud.id_auditoria);
    if (hs.length < MIN_HALLAZGOS) problemas.push(`Se requieren al menos ${MIN_HALLAZGOS} hallazgos documentados (actualmente ${hs.length}).`);
    const sinRec = hs.filter((h) => h.recomendaciones.length === 0);
    if (sinRec.length) problemas.push(`Hallazgos sin recomendación: ${sinRec.map((h) => h.codigo).join(', ')}.`);
  }
  return problemas;
}

/** Consolida toda la información de la auditoría para el informe (instantánea). */
export function consolidar(idAuditoria) {
  const aud = getAuditoria(idAuditoria);
  const evaluaciones = getEvaluaciones(idAuditoria);
  const indicadores = calcularIndicadores(evaluaciones.map((e) => e.estado));
  const hallazgos = getHallazgos(idAuditoria);
  const evidencias = getEvidencias(idAuditoria);
  const porSeveridad = { ALTA: 0, MEDIA: 0, BAJA: 0 };
  hallazgos.forEach((h) => porSeveridad[h.severidad]++);
  const pct = (n) => (indicadores.aplicables ? `${String(round1((100 * n) / indicadores.aplicables)).replace('.', ',')} %` : '—');
  const sev = Object.entries(porSeveridad).filter(([, n]) => n).map(([s, n]) => `${n} de severidad ${s.toLowerCase()}`).join(', ');
  const resumen =
    `De los ${indicadores.aplicables} controles aplicables evaluados, ${indicadores.implementados} (${pct(indicadores.implementados)}) están implementados, ` +
    `${indicadores.parciales} parcialmente y ${indicadores.no_implementados} no implementados` +
    (indicadores.no_aplicables ? `; ${indicadores.no_aplicables} control(es) se declararon no aplicables y se excluyen del denominador` : '') +
    `. Se documentaron ${hallazgos.length} hallazgo(s)${sev ? ` (${sev})` : ''}. El indicador es descriptivo y no constituye certificación.`;
  return {
    auditoria: aud,
    evaluaciones,
    indicadores,
    hallazgos,
    evidencias,
    hallazgos_por_severidad: porSeveridad,
    resumen,
    limitaciones: LIMITACIONES,
  };
}
