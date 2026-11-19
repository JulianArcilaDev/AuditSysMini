// Módulo 2 · Catálogo de controles (RF02). Consulta: todos los usuarios. Administración: solo admin (RNF04).
import { Router } from 'express';
import { getDb, log } from '../db.js';
import { requireAdmin } from '../auth.js';
import { validate, r, HttpError, CATEGORIAS } from '../validators.js';
import { id } from './helpers.js';

const router = Router();

const ORDER = 'ORDER BY CAST(substr(codigo_iso,1,1) AS INT), CAST(substr(codigo_iso,3) AS INT)';

router.get('/controles', (req, res) => {
  const { q, categoria, activos } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(codigo_iso LIKE ? OR nombre LIKE ? OR criterio LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (categoria) { where.push('categoria = ?'); params.push(categoria); }
  if (activos !== '0') where.push('activo = 1');
  const sql = `SELECT * FROM control ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${ORDER}`;
  res.json(getDb().prepare(sql).all(...params));
});

router.get('/controles/:id', (req, res) => {
  const c = getDb().prepare('SELECT * FROM control WHERE id_control = ?').get(id(req.params.id));
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

router.post('/controles', requireAdmin, (req, res) => {
  const d = validate(req.body, schema);
  const info = getDb().prepare(`INSERT INTO control (codigo_iso, nombre, categoria, criterio, pregunta, ejemplo, evidencia_sugerida, fuente)
    VALUES (?,?,?,?,?,?,?,?)`).run(d.codigo_iso, d.nombre, d.categoria, d.criterio, d.pregunta, d.ejemplo, d.evidencia_sugerida, d.fuente || 'ISO/IEC 27002:2022');
  log(req.user.id_usuario, 'CREAR', 'control', Number(info.lastInsertRowid), d.codigo_iso);
  res.status(201).json({ id_control: Number(info.lastInsertRowid) });
});

router.put('/controles/:id', requireAdmin, (req, res) => {
  const cid = id(req.params.id);
  const d = validate(req.body, schema);
  const activo = req.body.activo === 0 || req.body.activo === false ? 0 : 1;
  const info = getDb().prepare(`UPDATE control SET codigo_iso=?, nombre=?, categoria=?, criterio=?, pregunta=?, ejemplo=?, evidencia_sugerida=?, fuente=?, activo=?
    WHERE id_control = ?`).run(d.codigo_iso, d.nombre, d.categoria, d.criterio, d.pregunta, d.ejemplo, d.evidencia_sugerida, d.fuente || 'ISO/IEC 27002:2022', activo, cid);
  if (!info.changes) throw new HttpError(404, 'Control no encontrado.');
  log(req.user.id_usuario, 'ACTUALIZAR', 'control', cid, d.codigo_iso);
  res.json({ ok: true });
});

export default router;
