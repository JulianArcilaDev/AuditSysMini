// Módulo 4 · Hallazgos (RF05) y recomendaciones (RF06).
import { Router } from 'express';
import { getDb, log, tx, nextCode } from '../db.js';
import { validate, r, HttpError, SEVERIDADES } from '../validators.js';
import { getAuditoria, getHallazgos } from '../services/auditoria.js';
import { id, loadEvaluacionEditable } from './helpers.js';

const router = Router();

const hallazgoSchema = {
  condicion: [r.required('La condición'), r.min(10, 'La condición'), r.max(3000, 'La condición')],
  criterio: [r.required('El criterio'), r.min(10, 'El criterio'), r.max(3000, 'El criterio')],
  causa: [r.required('La causa'), r.min(5, 'La causa'), r.max(3000, 'La causa')],
  efecto_riesgo: [r.required('El efecto o riesgo'), r.min(10, 'El efecto o riesgo'), r.max(3000, 'El efecto o riesgo')],
  severidad: [r.required('La severidad'), r.oneOf(SEVERIDADES, 'La severidad')],
};
const recSchema = {
  descripcion: [r.required('La recomendación'), r.min(10, 'La recomendación'), r.max(3000, 'La recomendación')],
  prioridad: [r.required('La prioridad'), r.oneOf(SEVERIDADES, 'La prioridad')],
  plazo_dias: [r.required('El plazo'), r.int(1, 730, 'El plazo (días)')],
  responsable: [r.max(150, 'El responsable')],
};

router.get('/auditorias/:id/hallazgos', (req, res) => {
  const aud = getAuditoria(id(req.params.id));
  res.json(getHallazgos(aud.id_auditoria));
});

function insertRec(db, idHallazgo, idAuditoria, d) {
  const codigo = nextCode('R', `SELECT r.codigo FROM recomendacion r JOIN hallazgo h ON h.id_hallazgo = r.id_hallazgo WHERE h.id_auditoria = ?`, idAuditoria);
  const info = db.prepare('INSERT INTO recomendacion (id_hallazgo, codigo, descripcion, prioridad, plazo_dias, responsable) VALUES (?,?,?,?,?,?)')
    .run(idHallazgo, codigo, d.descripcion, d.prioridad, Number(d.plazo_dias), d.responsable);
  return { id_recomendacion: Number(info.lastInsertRowid), codigo };
}

// Crear hallazgo (opcionalmente con su recomendación en la misma transacción)
router.post('/evaluaciones/:id/hallazgos', (req, res) => {
  const { ev } = loadEvaluacionEditable(req.params.id, req.user);
  if (ev.estado === 'PENDIENTE') throw new HttpError(409, 'Evalúe el control antes de documentar un hallazgo.');
  const d = validate(req.body, hallazgoSchema);
  const rec = req.body.recomendacion?.descripcion ? validate(req.body.recomendacion, recSchema) : null;
  const result = tx((db) => {
    const codigo = nextCode('H', 'SELECT codigo FROM hallazgo WHERE id_auditoria = ?', ev.id_auditoria);
    const info = db.prepare(`INSERT INTO hallazgo (id_evaluacion, id_auditoria, codigo, condicion, criterio, causa, efecto_riesgo, severidad)
      VALUES (?,?,?,?,?,?,?,?)`).run(ev.id_evaluacion, ev.id_auditoria, codigo, d.condicion, d.criterio, d.causa, d.efecto_riesgo, d.severidad);
    const idH = Number(info.lastInsertRowid);
    const r2 = rec ? insertRec(db, idH, ev.id_auditoria, rec) : null;
    return { id_hallazgo: idH, codigo, recomendacion: r2 };
  });
  log(req.user.id_usuario, 'CREAR', 'hallazgo', result.id_hallazgo, result.codigo);
  res.status(201).json(result);
});

function loadHallazgo(idH, user) {
  const h = getDb().prepare('SELECT * FROM hallazgo WHERE id_hallazgo = ?').get(id(idH));
  if (!h) throw new HttpError(404, 'Hallazgo no encontrado.');
  loadEvaluacionEditable(h.id_evaluacion, user);
  return h;
}

router.put('/hallazgos/:id', (req, res) => {
  const h = loadHallazgo(req.params.id, req.user);
  const d = validate(req.body, hallazgoSchema);
  getDb().prepare('UPDATE hallazgo SET condicion=?, criterio=?, causa=?, efecto_riesgo=?, severidad=? WHERE id_hallazgo=?')
    .run(d.condicion, d.criterio, d.causa, d.efecto_riesgo, d.severidad, h.id_hallazgo);
  log(req.user.id_usuario, 'ACTUALIZAR', 'hallazgo', h.id_hallazgo, h.codigo);
  res.json({ ok: true });
});

router.delete('/hallazgos/:id', (req, res) => {
  const h = loadHallazgo(req.params.id, req.user);
  getDb().prepare('DELETE FROM hallazgo WHERE id_hallazgo = ?').run(h.id_hallazgo);
  log(req.user.id_usuario, 'ELIMINAR', 'hallazgo', h.id_hallazgo, h.codigo);
  res.json({ ok: true });
});

router.post('/hallazgos/:id/recomendaciones', (req, res) => {
  const h = loadHallazgo(req.params.id, req.user);
  const d = validate(req.body, recSchema);
  const out = insertRec(getDb(), h.id_hallazgo, h.id_auditoria, d);
  log(req.user.id_usuario, 'CREAR', 'recomendacion', out.id_recomendacion, out.codigo);
  res.status(201).json(out);
});

function loadRec(idR, user) {
  const rec = getDb().prepare('SELECT r.*, h.id_evaluacion FROM recomendacion r JOIN hallazgo h ON h.id_hallazgo = r.id_hallazgo WHERE r.id_recomendacion = ?').get(id(idR));
  if (!rec) throw new HttpError(404, 'Recomendación no encontrada.');
  loadEvaluacionEditable(rec.id_evaluacion, user);
  return rec;
}

router.put('/recomendaciones/:id', (req, res) => {
  const rec = loadRec(req.params.id, req.user);
  const d = validate(req.body, recSchema);
  getDb().prepare('UPDATE recomendacion SET descripcion=?, prioridad=?, plazo_dias=?, responsable=? WHERE id_recomendacion=?')
    .run(d.descripcion, d.prioridad, Number(d.plazo_dias), d.responsable, rec.id_recomendacion);
  log(req.user.id_usuario, 'ACTUALIZAR', 'recomendacion', rec.id_recomendacion, rec.codigo);
  res.json({ ok: true });
});

router.delete('/recomendaciones/:id', (req, res) => {
  const rec = loadRec(req.params.id, req.user);
  getDb().prepare('DELETE FROM recomendacion WHERE id_recomendacion = ?').run(rec.id_recomendacion);
  log(req.user.id_usuario, 'ELIMINAR', 'recomendacion', rec.id_recomendacion, rec.codigo);
  res.json({ ok: true });
});

export default router;
