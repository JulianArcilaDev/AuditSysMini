// Módulo 3 · Evaluación de controles (RF03) y Módulo 4 · Evidencias (RF04).
import { Router } from 'express';
import path from 'node:path';
import { all, one, query, log, nextCode } from '../db.js';
import { validate, r, HttpError, ValidationError, ESTADOS_EVAL, TIPOS_EVIDENCIA } from '../validators.js';
import { getAuditoria, getHallazgos, EVIDENCIA_COLS } from '../services/auditoria.js';
import { id, loadEvaluacionEditable, touch } from './helpers.js';

const router = Router();

router.get('/evaluaciones/:id', async (req, res) => {
  const ev = await one(`SELECT e.*, c.codigo_iso, c.nombre AS control_nombre, c.categoria, c.criterio, c.pregunta, c.ejemplo, c.evidencia_sugerida, c.fuente
    FROM evaluacion_control e JOIN control c ON c.id_control = e.id_control WHERE e.id_evaluacion = ?`, [id(req.params.id)]);
  if (!ev) throw new HttpError(404, 'Evaluación no encontrada.');
  const evidencias = await all(`SELECT ${EVIDENCIA_COLS} FROM evidencia v WHERE v.id_evaluacion = ? ORDER BY v.id_evidencia`, [ev.id_evaluacion]);
  const hallazgos = (await getHallazgos(ev.id_auditoria)).filter((h) => h.id_evaluacion === ev.id_evaluacion);
  res.json({ ...ev, evidencias, hallazgos });
});

router.put('/evaluaciones/:id', async (req, res) => {
  const { ev } = await loadEvaluacionEditable(req.params.id, req.user);
  const d = validate(req.body, {
    estado: [r.required('El estado'), r.oneOf(ESTADOS_EVAL, 'El estado')],
    observacion: [r.required('La observación'), r.min(5, 'La observación'), r.max(3000, 'La observación')],
    justificacion_na: [r.max(2000, 'La justificación')],
  });
  if (d.estado === 'NO_APLICABLE' && (!d.justificacion_na || d.justificacion_na.length < 10))
    throw new ValidationError({ justificacion_na: 'Un control "No aplicable" exige una justificación (mínimo 10 caracteres).' });
  await query('UPDATE evaluacion_control SET estado=?, observacion=?, justificacion_na=?, evaluado_en=now() WHERE id_evaluacion=?',
    [d.estado, d.observacion, d.estado === 'NO_APLICABLE' ? d.justificacion_na : null, ev.id_evaluacion]);
  await touch(ev.id_auditoria);
  await log(req.user.id_usuario, 'EVALUAR', 'evaluacion_control', ev.id_evaluacion, d.estado);
  const { n } = await one('SELECT COUNT(*) AS n FROM evidencia WHERE id_evaluacion = ?', [ev.id_evaluacion]);
  const advertencias = [];
  if (['IMPLEMENTADO', 'PARCIAL'].includes(d.estado) && n === 0)
    advertencias.push('Este estado requiere al menos una evidencia antes de pasar la auditoría a revisión.');
  res.json({ ok: true, advertencias });
});

// ---- Evidencias ----
const TIPOS_MIME = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain',
  '.csv': 'text/csv', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const MAX_BYTES = 5 * 1024 * 1024;

router.post('/evaluaciones/:id/evidencias', async (req, res) => {
  const { ev } = await loadEvaluacionEditable(req.params.id, req.user);
  const d = validate(req.body, {
    descripcion: [r.required('La descripción'), r.min(5, 'La descripción'), r.max(1000, 'La descripción')],
    tipo: [r.required('El tipo'), r.oneOf(TIPOS_EVIDENCIA, 'El tipo')],
    fuente: [r.required('La fuente'), r.min(2, 'La fuente'), r.max(200, 'La fuente')],
    fecha: [r.required('La fecha'), r.date('La fecha')],
    referencia: [r.max(500, 'La referencia')],
  });
  const archivo = req.body.archivo;
  if (!d.referencia && !archivo?.datos)
    throw new ValidationError({ referencia: 'Indique una referencia documental o adjunte un archivo.' });
  let nombre = null; let tipoMime = null; let datos = null;
  if (archivo?.datos) {
    nombre = path.basename(String(archivo.nombre || 'archivo')).slice(0, 150);
    const ext = path.extname(nombre).toLowerCase();
    if (!TIPOS_MIME[ext]) throw new ValidationError({ archivo: `Tipo de archivo no permitido. Permitidos: ${Object.keys(TIPOS_MIME).join(', ')}.` });
    datos = Buffer.from(String(archivo.datos).replace(/^data:[^,]*,/, ''), 'base64');
    if (!datos.length || datos.length > MAX_BYTES) throw new ValidationError({ archivo: 'El archivo debe pesar entre 1 byte y 5 MB.' });
    tipoMime = TIPOS_MIME[ext];
  }
  const codigo = await nextCode('EV', `SELECT v.codigo FROM evidencia v JOIN evaluacion_control e ON e.id_evaluacion = v.id_evaluacion WHERE e.id_auditoria = ?`, ev.id_auditoria);
  const esSimulada = req.body.es_simulada === false || req.body.es_simulada === 0 ? 0 : 1;
  const v = await one(`INSERT INTO evidencia (id_evaluacion, codigo, descripcion, tipo, fuente, fecha, referencia, archivo_nombre, archivo_tipo, archivo_datos, es_simulada)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id_evidencia, codigo`,
  [ev.id_evaluacion, codigo, d.descripcion, d.tipo, d.fuente, d.fecha, d.referencia, nombre, tipoMime, datos, esSimulada]);
  await touch(ev.id_auditoria);
  await log(req.user.id_usuario, 'CREAR', 'evidencia', v.id_evidencia, codigo);
  res.status(201).json(v);
});

router.delete('/evidencias/:id', async (req, res) => {
  const v = await one('SELECT id_evidencia, id_evaluacion, codigo FROM evidencia WHERE id_evidencia = ?', [id(req.params.id)]);
  if (!v) throw new HttpError(404, 'Evidencia no encontrada.');
  await loadEvaluacionEditable(v.id_evaluacion, req.user);
  await query('DELETE FROM evidencia WHERE id_evidencia = ?', [v.id_evidencia]);
  await log(req.user.id_usuario, 'ELIMINAR', 'evidencia', v.id_evidencia, v.codigo);
  res.json({ ok: true });
});

router.get('/evidencias/:id/archivo', async (req, res) => {
  const v = await one(`SELECT v.archivo_nombre, v.archivo_tipo, v.archivo_datos, e.id_auditoria
    FROM evidencia v JOIN evaluacion_control e ON e.id_evaluacion = v.id_evaluacion WHERE v.id_evidencia = ?`, [id(req.params.id)]);
  if (!v) throw new HttpError(404, 'Evidencia no encontrada.');
  if (!v.archivo_datos) throw new HttpError(404, 'La evidencia no tiene archivo adjunto.');
  await getAuditoria(v.id_auditoria);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.attachment(v.archivo_nombre);
  res.type(v.archivo_tipo || 'application/octet-stream');
  res.send(v.archivo_datos);
});

export default router;
