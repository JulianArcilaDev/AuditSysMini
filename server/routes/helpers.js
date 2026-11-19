import { getDb } from '../db.js';
import { HttpError } from '../validators.js';
import { getAuditoria, assertEditable } from '../services/auditoria.js';

export const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador no válido.');
  return n;
};

const TRABAJO_CAMPO = ['EN_EJECUCION', 'EN_REVISION'];

/** Carga una evaluación con su auditoría y verifica que se pueda editar en trabajo de campo. */
export function loadEvaluacionEditable(idEvaluacion, user) {
  const ev = getDb().prepare('SELECT * FROM evaluacion_control WHERE id_evaluacion = ?').get(id(idEvaluacion));
  if (!ev) throw new HttpError(404, 'Evaluación no encontrada.');
  const aud = getAuditoria(ev.id_auditoria);
  assertEditable(aud, user);
  if (!TRABAJO_CAMPO.includes(aud.estado))
    throw new HttpError(409, 'Inicie la ejecución de la auditoría (estado EN_EJECUCION) para evaluar controles y registrar evidencias o hallazgos.');
  return { ev, aud };
}
