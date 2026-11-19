// Módulo 3 · Evaluación de controles (RF03) y Módulo 4 · Evidencias (RF04).
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb, log, nextCode, UPLOAD_DIR } from '../db.js';
import { validate, r, HttpError, ValidationError, ESTADOS_EVAL, TIPOS_EVIDENCIA } from '../validators.js';
import { getAuditoria, getHallazgos } from '../services/auditoria.js';
import { id, loadEvaluacionEditable } from './helpers.js';

const router = Router();

router.get('/evaluaciones/:id', (req, res) => {
  const db = getDb();
  const ev = db.prepare(`SELECT e.*, c.codigo_iso, c.nombre AS control_nombre, c.categoria, c.criterio, c.pregunta, c.ejemplo, c.evidencia_sugerida, c.fuente
    FROM evaluacion_control e JOIN control c ON c.id_control = e.id_control WHERE e.id_evaluacion = ?`).get(id(req.params.id));
  if (!ev) throw new HttpError(404, 'Evaluación no encontrada.');
  const evidencias = db.prepare('SELECT * FROM evidencia WHERE id_evaluacion = ? ORDER BY id_evidencia').all(ev.id_evaluacion);
  const hallazgos = getHallazgos(ev.id_auditoria).filter((h) => h.id_evaluacion === ev.id_evaluacion);
  res.json({ ...ev, evidencias, hallazgos });
});

router.put('/evaluaciones/:id', (req, res) => {
  const { ev } = loadEvaluacionEditable(req.params.id, req.user);
  const d = validate(req.body, {
    estado: [r.required('El estado'), r.oneOf(ESTADOS_EVAL, 'El estado')],
    observacion: [r.required('La observación'), r.min(5, 'La observación'), r.max(3000, 'La observación')],
    justificacion_na: [r.max(2000, 'La justificación')],
  });
  if (d.estado === 'NO_APLICABLE' && (!d.justificacion_na || d.justificacion_na.length < 10))
    throw new ValidationError({ justificacion_na: 'Un control "No aplicable" exige una justificación (mínimo 10 caracteres).' });
  getDb().prepare(`UPDATE evaluacion_control SET estado=?, observacion=?, justificacion_na=?, evaluado_en=datetime('now') WHERE id_evaluacion=?`)
    .run(d.estado, d.observacion, d.estado === 'NO_APLICABLE' ? d.justificacion_na : null, ev.id_evaluacion);
  getDb().prepare("UPDATE auditoria SET actualizado_en = datetime('now') WHERE id_auditoria = ?").run(ev.id_auditoria);
  log(req.user.id_usuario, 'EVALUAR', 'evaluacion_control', ev.id_evaluacion, d.estado);
  const nEv = getDb().prepare('SELECT COUNT(*) n FROM evidencia WHERE id_evaluacion = ?').get(ev.id_evaluacion).n;
  const advertencias = [];
  if (['IMPLEMENTADO', 'PARCIAL'].includes(d.estado) && nEv === 0)
    advertencias.push('Este estado requiere al menos una evidencia antes de pasar la auditoría a revisión.');
  res.json({ ok: true, advertencias });
});

// ---- Evidencias ----
const EXT_PERMITIDAS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.csv', '.docx', '.xlsx', '.pptx'];
const MAX_BYTES = 5 * 1024 * 1024;

router.post('/evaluaciones/:id/evidencias', (req, res) => {
  const { ev } = loadEvaluacionEditable(req.params.id, req.user);
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
  let archivoNombre = null;
  let archivoRuta = null;
  if (archivo?.datos) {
    const nombre = path.basename(String(archivo.nombre || 'archivo')).slice(0, 150);
    const ext = path.extname(nombre).toLowerCase();
    if (!EXT_PERMITIDAS.includes(ext)) throw new ValidationError({ archivo: `Tipo de archivo no permitido. Permitidos: ${EXT_PERMITIDAS.join(', ')}.` });
    const buf = Buffer.from(String(archivo.datos).replace(/^data:[^,]*,/, ''), 'base64');
    if (!buf.length || buf.length > MAX_BYTES) throw new ValidationError({ archivo: 'El archivo debe pesar entre 1 byte y 5 MB.' });
    archivoRuta = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, archivoRuta), buf);
    archivoNombre = nombre;
  }
  const codigo = nextCode('EV', `SELECT v.codigo FROM evidencia v JOIN evaluacion_control e ON e.id_evaluacion = v.id_evaluacion WHERE e.id_auditoria = ?`, ev.id_auditoria);
  const esSimulada = req.body.es_simulada === false || req.body.es_simulada === 0 ? 0 : 1;
  const info = getDb().prepare(`INSERT INTO evidencia (id_evaluacion, codigo, descripcion, tipo, fuente, fecha, referencia, archivo_nombre, archivo_ruta, es_simulada)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(ev.id_evaluacion, codigo, d.descripcion, d.tipo, d.fuente, d.fecha, d.referencia, archivoNombre, archivoRuta, esSimulada);
  log(req.user.id_usuario, 'CREAR', 'evidencia', Number(info.lastInsertRowid), codigo);
  res.status(201).json({ id_evidencia: Number(info.lastInsertRowid), codigo });
});

function loadEvidencia(idEv) {
  const v = getDb().prepare('SELECT * FROM evidencia WHERE id_evidencia = ?').get(id(idEv));
  if (!v) throw new HttpError(404, 'Evidencia no encontrada.');
  return v;
}

router.delete('/evidencias/:id', (req, res) => {
  const v = loadEvidencia(req.params.id);
  loadEvaluacionEditable(v.id_evaluacion, req.user);
  getDb().prepare('DELETE FROM evidencia WHERE id_evidencia = ?').run(v.id_evidencia);
  if (v.archivo_ruta) fs.rmSync(path.join(UPLOAD_DIR, v.archivo_ruta), { force: true });
  log(req.user.id_usuario, 'ELIMINAR', 'evidencia', v.id_evidencia, v.codigo);
  res.json({ ok: true });
});

router.get('/evidencias/:id/archivo', (req, res) => {
  const v = loadEvidencia(req.params.id);
  if (!v.archivo_ruta) throw new HttpError(404, 'La evidencia no tiene archivo adjunto.');
  const ev = getDb().prepare('SELECT id_auditoria FROM evaluacion_control WHERE id_evaluacion = ?').get(v.id_evaluacion);
  getAuditoria(ev.id_auditoria);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(path.join(UPLOAD_DIR, path.basename(v.archivo_ruta)), v.archivo_nombre);
});

export default router;
