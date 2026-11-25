import { one } from '../db.js';
import { HttpError } from '../validators.js';
import { getAuditoria, assertEditable } from '../services/auditoria.js';

export const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw new HttpError(400, 'Identificador no válido.');
  return n;
};

const TRABAJO_CAMPO = ['EN_EJECUCION', 'EN_REVISION'];

/** Carga una evaluación con su auditoría y verifica que se pueda editar en trabajo de campo. */
export async function loadEvaluacionEditable(idEvaluacion, user) {
  const ev = await one('SELECT * FROM evaluacion_control WHERE id_evaluacion = ?', [id(idEvaluacion)]);
  if (!ev) throw new HttpError(404, 'Evaluación no encontrada.');
  const aud = await getAuditoria(ev.id_auditoria);
  assertEditable(aud, user);
  if (!TRABAJO_CAMPO.includes(aud.estado))
    throw new HttpError(409, 'Inicie la ejecución de la auditoría (estado EN_EJECUCION) para evaluar controles y registrar evidencias o hallazgos.');
  return { ev, aud };
}

export const touch = (idAuditoria) => one('UPDATE auditoria SET actualizado_en = now() WHERE id_auditoria = ? RETURNING id_auditoria', [idAuditoria]);
