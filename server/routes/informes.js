// Módulo 5 · Informes (RF08). El informe se genera desde la BD y se guarda como instantánea versionada.
import { Router } from 'express';
import { getDb, log } from '../db.js';
import { HttpError } from '../validators.js';
import { getAuditoria, consolidar } from '../services/auditoria.js';
import { id } from './helpers.js';

const router = Router();

export const SECCIONES = [
  { clave: 'datos', titulo: 'Datos de la auditoría' },
  { clave: 'alcance', titulo: 'Alcance y criterios' },
  { clave: 'resultados', titulo: 'Resultados e indicadores' },
  { clave: 'evaluacion', titulo: 'Evaluación por control' },
  { clave: 'hallazgos', titulo: 'Hallazgos' },
  { clave: 'recomendaciones', titulo: 'Recomendaciones' },
  { clave: 'evidencias', titulo: 'Anexo de evidencias' },
  { clave: 'limitaciones', titulo: 'Limitaciones' },
];

router.get('/informes/secciones', (req, res) => res.json(SECCIONES));

// Vista previa en vivo (no se guarda)
router.get('/auditorias/:id/preview', (req, res) => {
  res.json({ version: null, generado_en: new Date().toISOString(), secciones: SECCIONES.map((s) => s.clave), contenido: consolidar(id(req.params.id)) });
});

router.get('/auditorias/:id/informes', (req, res) => {
  const aud = getAuditoria(id(req.params.id));
  res.json(getDb().prepare(`SELECT i.id_informe, i.version, i.generado_en, i.cumplimiento_base, i.indice_ponderado, u.nombre AS generado_por
    FROM informe i JOIN usuario u ON u.id_usuario = i.id_generador WHERE i.id_auditoria = ? ORDER BY i.version DESC`).all(aud.id_auditoria));
});

router.post('/auditorias/:id/informes', (req, res) => {
  const aud = getAuditoria(id(req.params.id));
  if (req.user.rol !== 'admin' && aud.id_auditor !== req.user.id_usuario)
    throw new HttpError(403, 'Solo el auditor responsable o un administrador puede generar informes.');
  const claves = SECCIONES.map((s) => s.clave);
  let secciones = Array.isArray(req.body.secciones) ? req.body.secciones.filter((s) => claves.includes(s)) : claves;
  if (!secciones.includes('limitaciones')) secciones.push('limitaciones'); // salvaguarda obligatoria
  if (secciones.length < 2) throw new HttpError(400, 'Seleccione al menos una sección además de las limitaciones.');
  const contenido = consolidar(aud.id_auditoria);
  if (!contenido.evaluaciones.length) throw new HttpError(409, 'La auditoría no tiene controles seleccionados.');
  const db = getDb();
  const version = (db.prepare('SELECT MAX(version) v FROM informe WHERE id_auditoria = ?').get(aud.id_auditoria).v || 0) + 1;
  const info = db.prepare(`INSERT INTO informe (id_auditoria, version, id_generador, cumplimiento_base, indice_ponderado, secciones, contenido)
    VALUES (?,?,?,?,?,?,?)`).run(aud.id_auditoria, version, req.user.id_usuario, contenido.indicadores.cumplimiento_base,
    contenido.indicadores.indice_ponderado, JSON.stringify(secciones), JSON.stringify(contenido));
  log(req.user.id_usuario, 'GENERAR', 'informe', Number(info.lastInsertRowid), `v${version}`);
  res.status(201).json({ id_informe: Number(info.lastInsertRowid), version });
});

router.get('/informes/:id', (req, res) => {
  const i = getDb().prepare(`SELECT i.*, u.nombre AS generado_por FROM informe i JOIN usuario u ON u.id_usuario = i.id_generador WHERE i.id_informe = ?`).get(id(req.params.id));
  if (!i) throw new HttpError(404, 'Informe no encontrado.');
  res.json({ ...i, secciones: JSON.parse(i.secciones), contenido: JSON.parse(i.contenido) });
});

export default router;
