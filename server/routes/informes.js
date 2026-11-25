// Módulo 5 · Informes (RF08). El informe se genera desde la BD y se guarda como instantánea versionada.
import { Router } from 'express';
import { all, one, log, tx } from '../db.js';
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
router.get('/auditorias/:id/preview', async (req, res) => {
  res.json({ version: null, generado_en: new Date().toISOString(), secciones: SECCIONES.map((s) => s.clave), contenido: await consolidar(id(req.params.id)) });
});

router.get('/auditorias/:id/informes', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  res.json(await all(`SELECT i.id_informe, i.version, i.generado_en, i.cumplimiento_base, i.indice_ponderado, u.nombre AS generado_por
    FROM informe i JOIN usuario u ON u.id_usuario = i.id_generador WHERE i.id_auditoria = ? ORDER BY i.version DESC`, [aud.id_auditoria]));
});

router.post('/auditorias/:id/informes', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  if (req.user.rol !== 'admin' && aud.id_auditor !== req.user.id_usuario)
    throw new HttpError(403, 'Solo el auditor responsable o un administrador puede generar informes.');
  const claves = SECCIONES.map((s) => s.clave);
  const secciones = Array.isArray(req.body.secciones) ? req.body.secciones.filter((s) => claves.includes(s)) : claves;
  if (!secciones.includes('limitaciones')) secciones.push('limitaciones'); // salvaguarda obligatoria
  if (secciones.length < 2) throw new HttpError(400, 'Seleccione al menos una sección además de las limitaciones.');
  const contenido = await consolidar(aud.id_auditoria);
  if (!contenido.evaluaciones.length) throw new HttpError(409, 'La auditoría no tiene controles seleccionados.');
  const inf = await tx(async () => {
    // Bloquea la auditoría para que dos generaciones simultáneas no tomen la misma versión
    await one('SELECT id_auditoria FROM auditoria WHERE id_auditoria = ? FOR UPDATE', [aud.id_auditoria]);
    const { v } = await one('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM informe WHERE id_auditoria = ?', [aud.id_auditoria]);
    return one(`INSERT INTO informe (id_auditoria, version, id_generador, cumplimiento_base, indice_ponderado, secciones, contenido)
      VALUES (?,?,?,?,?,?,?) RETURNING id_informe, version`,
    [aud.id_auditoria, v, req.user.id_usuario, contenido.indicadores.cumplimiento_base, contenido.indicadores.indice_ponderado,
      JSON.stringify(secciones), JSON.stringify(contenido)]);
  });
  await log(req.user.id_usuario, 'GENERAR', 'informe', inf.id_informe, `v${inf.version}`);
  res.status(201).json(inf);
});

router.get('/informes/:id', async (req, res) => {
  const i = await one(`SELECT i.*, u.nombre AS generado_por FROM informe i JOIN usuario u ON u.id_usuario = i.id_generador WHERE i.id_informe = ?`, [id(req.params.id)]);
  if (!i) throw new HttpError(404, 'Informe no encontrado.');
  res.json(i); // secciones y contenido ya vienen como JSON (JSONB)
});

export default router;
