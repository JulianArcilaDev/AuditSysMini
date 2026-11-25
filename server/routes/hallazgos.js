// Módulo 4 · Hallazgos (RF05) y recomendaciones (RF06).
import { Router } from 'express';
import { one, query, log, tx, nextCode } from '../db.js';
import { validate, r, HttpError, SEVERIDADES } from '../validators.js';
import { getAuditoria, getHallazgos } from '../services/auditoria.js';
import { id, loadEvaluacionEditable, touch } from './helpers.js';

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

router.get('/auditorias/:id/hallazgos', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  res.json(await getHallazgos(aud.id_auditoria));
});

async function insertRec(idHallazgo, idAuditoria, d) {
  const codigo = await nextCode('R', `SELECT r.codigo FROM recomendacion r JOIN hallazgo h ON h.id_hallazgo = r.id_hallazgo WHERE h.id_auditoria = ?`, idAuditoria);
  return one('INSERT INTO recomendacion (id_hallazgo, codigo, descripcion, prioridad, plazo_dias, responsable) VALUES (?,?,?,?,?,?) RETURNING id_recomendacion, codigo',
    [idHallazgo, codigo, d.descripcion, d.prioridad, Number(d.plazo_dias), d.responsable]);
}

// Crear hallazgo (opcionalmente con su recomendación en la misma transacción)
router.post('/evaluaciones/:id/hallazgos', async (req, res) => {
  const { ev } = await loadEvaluacionEditable(req.params.id, req.user);
  if (ev.estado === 'PENDIENTE') throw new HttpError(409, 'Evalúe el control antes de documentar un hallazgo.');
  const d = validate(req.body, hallazgoSchema);
  const rec = req.body.recomendacion?.descripcion ? validate(req.body.recomendacion, recSchema) : null;
  const result = await tx(async () => {
    const codigo = await nextCode('H', 'SELECT codigo FROM hallazgo WHERE id_auditoria = ?', ev.id_auditoria);
    const h = await one(`INSERT INTO hallazgo (id_evaluacion, id_auditoria, codigo, condicion, criterio, causa, efecto_riesgo, severidad)
      VALUES (?,?,?,?,?,?,?,?) RETURNING id_hallazgo, codigo`,
    [ev.id_evaluacion, ev.id_auditoria, codigo, d.condicion, d.criterio, d.causa, d.efecto_riesgo, d.severidad]);
    const r2 = rec ? await insertRec(h.id_hallazgo, ev.id_auditoria, rec) : null;
    await touch(ev.id_auditoria);
    return { ...h, recomendacion: r2 };
  });
  await log(req.user.id_usuario, 'CREAR', 'hallazgo', result.id_hallazgo, result.codigo);
  res.status(201).json(result);
});

async function loadHallazgo(idH, user) {
  const h = await one('SELECT * FROM hallazgo WHERE id_hallazgo = ?', [id(idH)]);
  if (!h) throw new HttpError(404, 'Hallazgo no encontrado.');
  await loadEvaluacionEditable(h.id_evaluacion, user);
  return h;
}

router.put('/hallazgos/:id', async (req, res) => {
  const h = await loadHallazgo(req.params.id, req.user);
  const d = validate(req.body, hallazgoSchema);
  await query('UPDATE hallazgo SET condicion=?, criterio=?, causa=?, efecto_riesgo=?, severidad=? WHERE id_hallazgo=?',
    [d.condicion, d.criterio, d.causa, d.efecto_riesgo, d.severidad, h.id_hallazgo]);
  await log(req.user.id_usuario, 'ACTUALIZAR', 'hallazgo', h.id_hallazgo, h.codigo);
  res.json({ ok: true });
});

router.delete('/hallazgos/:id', async (req, res) => {
  const h = await loadHallazgo(req.params.id, req.user);
  await query('DELETE FROM hallazgo WHERE id_hallazgo = ?', [h.id_hallazgo]);
  await log(req.user.id_usuario, 'ELIMINAR', 'hallazgo', h.id_hallazgo, h.codigo);
  res.json({ ok: true });
});

router.post('/hallazgos/:id/recomendaciones', async (req, res) => {
  const h = await loadHallazgo(req.params.id, req.user);
  const d = validate(req.body, recSchema);
  const out = await insertRec(h.id_hallazgo, h.id_auditoria, d);
  await log(req.user.id_usuario, 'CREAR', 'recomendacion', out.id_recomendacion, out.codigo);
  res.status(201).json(out);
});

async function loadRec(idR, user) {
  const rec = await one('SELECT r.*, h.id_evaluacion FROM recomendacion r JOIN hallazgo h ON h.id_hallazgo = r.id_hallazgo WHERE r.id_recomendacion = ?', [id(idR)]);
  if (!rec) throw new HttpError(404, 'Recomendación no encontrada.');
  await loadEvaluacionEditable(rec.id_evaluacion, user);
  return rec;
}

router.put('/recomendaciones/:id', async (req, res) => {
  const rec = await loadRec(req.params.id, req.user);
  const d = validate(req.body, recSchema);
  await query('UPDATE recomendacion SET descripcion=?, prioridad=?, plazo_dias=?, responsable=? WHERE id_recomendacion=?',
    [d.descripcion, d.prioridad, Number(d.plazo_dias), d.responsable, rec.id_recomendacion]);
  await log(req.user.id_usuario, 'ACTUALIZAR', 'recomendacion', rec.id_recomendacion, rec.codigo);
  res.json({ ok: true });
});

router.delete('/recomendaciones/:id', async (req, res) => {
  const rec = await loadRec(req.params.id, req.user);
  await query('DELETE FROM recomendacion WHERE id_recomendacion = ?', [rec.id_recomendacion]);
  await log(req.user.id_usuario, 'ELIMINAR', 'recomendacion', rec.id_recomendacion, rec.codigo);
  res.json({ ok: true });
});

export default router;
