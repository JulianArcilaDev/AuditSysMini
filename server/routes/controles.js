// Módulo 2 · Catálogo de controles (RF02). Consulta: todos los usuarios. Administración: solo admin (RNF04).
import { Router } from 'express';
import { all, one, log } from '../db.js';
import { requireAdmin } from '../auth.js';
import { validate, r, HttpError, CATEGORIAS } from '../validators.js';
import { ORDEN_ISO } from '../services/auditoria.js';
import { id } from './helpers.js';

const router = Router();

router.get('/controles', async (req, res) => {
  const { q, categoria, activos } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(codigo_iso ILIKE ? OR nombre ILIKE ? OR criterio ILIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (categoria) { where.push('categoria = ?'); params.push(categoria); }
  if (activos !== '0') where.push('activo = 1');
  res.json(await all(`SELECT * FROM control ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${ORDEN_ISO('codigo_iso')}`, params));
});

router.get('/controles/:id', async (req, res) => {
  const c = await one('SELECT * FROM control WHERE id_control = ?', [id(req.params.id)]);
  if (!c) throw new HttpError(404, 'Control no encontrado.');
  res.json(c);
});

const schema = {
  codigo_iso: [r.required('El código'), (v) => (v && !/^[5-8]\.\d{1,2}$/.test(v) ? 'El código debe tener el formato N.NN (p. ej. 8.23).' : null)],
  nombre: [r.required('El nombre'), r.min(3, 'El nombre'), r.max(200, 'El nombre')],
  categoria: [r.required('La categoría'), r.oneOf(CATEGORIAS, 'La categoría')],
  criterio: [r.required('El criterio'), r.min(10, 'El criterio')],
  pregunta: [r.max(500, 'La pregunta orientadora')],
  ejemplo: [r.max(500, 'El ejemplo')],
  evidencia_sugerida: [r.max(500, 'La evidencia sugerida')],
  fuente: [r.max(100, 'La fuente')],
};

router.post('/controles', requireAdmin, async (req, res) => {
  const d = validate(req.body, schema);
  const c = await one(`INSERT INTO control (codigo_iso, nombre, categoria, criterio, pregunta, ejemplo, evidencia_sugerida, fuente)
    VALUES (?,?,?,?,?,?,?,?) RETURNING id_control`,
  [d.codigo_iso, d.nombre, d.categoria, d.criterio, d.pregunta, d.ejemplo, d.evidencia_sugerida, d.fuente || 'ISO/IEC 27002:2022']);
  await log(req.user.id_usuario, 'CREAR', 'control', c.id_control, d.codigo_iso);
  res.status(201).json(c);
});

router.put('/controles/:id', requireAdmin, async (req, res) => {
  const cid = id(req.params.id);
  const d = validate(req.body, schema);
  const activo = req.body.activo === 0 || req.body.activo === false ? 0 : 1;
  const upd = await one(`UPDATE control SET codigo_iso=?, nombre=?, categoria=?, criterio=?, pregunta=?, ejemplo=?, evidencia_sugerida=?, fuente=?, activo=?
    WHERE id_control = ? RETURNING id_control`,
  [d.codigo_iso, d.nombre, d.categoria, d.criterio, d.pregunta, d.ejemplo, d.evidencia_sugerida, d.fuente || 'ISO/IEC 27002:2022', activo, cid]);
  if (!upd) throw new HttpError(404, 'Control no encontrado.');
  await log(req.user.id_usuario, 'ACTUALIZAR', 'control', cid, d.codigo_iso);
  res.json({ ok: true });
});

export default router;
