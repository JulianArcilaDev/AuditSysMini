// Módulo 1 · Configuración de auditoría (RF01) + selección de controles + ciclo de vida + trazabilidad (RNF05).
import { Router } from 'express';
import { all, one, query, log, tx } from '../db.js';
import { validate, r, HttpError, ValidationError, ESTADOS_AUDITORIA, MIN_CONTROLES, MAX_CONTROLES } from '../validators.js';
import {
  getAuditoria, assertEditable, getEvaluaciones, calcularIndicadores, verificarTransicion, getHallazgos, getEvidencias,
} from '../services/auditoria.js';
import { id, touch } from './helpers.js';

const router = Router();
const REFERENTES = 'ISO 19011:2018; ISO/IEC 27001:2022; ISO/IEC 27002:2022';

const schema = {
  organizacion: [r.required('La organización'), r.min(2, 'La organización'), r.max(120, 'La organización')],
  objetivo: [r.required('El objetivo'), r.min(10, 'El objetivo'), r.max(2000, 'El objetivo')],
  alcance: [r.required('El alcance'), r.min(10, 'El alcance'), r.max(2000, 'El alcance')],
  referentes: [r.max(500, 'Los referentes')],
  fecha_inicio: [r.required('La fecha de inicio'), r.date('La fecha de inicio')],
  fecha_fin: [r.required('La fecha de cierre'), r.date('La fecha de cierre')],
  id_auditor: [r.int(1, 2147483647, 'El auditor responsable')],
};

async function validarAuditoria(body, user) {
  const d = validate(body, schema);
  if (d.fecha_fin < d.fecha_inicio) throw new ValidationError({ fecha_fin: 'La fecha de cierre debe ser igual o posterior a la de inicio.' });
  // Un auditor solo puede asignarse a sí mismo; el admin puede asignar a cualquiera.
  d.id_auditor = user.rol === 'admin' && d.id_auditor ? Number(d.id_auditor) : user.id_usuario;
  const aud = await one('SELECT id_usuario FROM usuario WHERE id_usuario = ? AND activo = 1', [d.id_auditor]);
  if (!aud) throw new ValidationError({ id_auditor: 'El auditor responsable no existe o está inactivo.' });
  return d;
}

router.get('/auditorias', async (req, res) => {
  const rows = await all(`
    SELECT a.id_auditoria, a.organizacion, a.objetivo, a.fecha_inicio, a.fecha_fin, a.estado, a.id_auditor, a.actualizado_en,
           u.nombre AS auditor_nombre,
           (SELECT COUNT(*) FROM hallazgo h WHERE h.id_auditoria = a.id_auditoria) AS n_hallazgos
    FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_auditor
    ORDER BY a.actualizado_en DESC, a.id_auditoria DESC`);
  const estados = await all('SELECT id_auditoria, estado FROM evaluacion_control');
  res.json(rows.map((a) => ({
    ...a,
    indicadores: calcularIndicadores(estados.filter((e) => e.id_auditoria === a.id_auditoria).map((e) => e.estado)),
  })));
});

router.post('/auditorias', async (req, res) => {
  const d = await validarAuditoria(req.body, req.user);
  const a = await one(`INSERT INTO auditoria (organizacion, objetivo, alcance, referentes, fecha_inicio, fecha_fin, id_auditor)
    VALUES (?,?,?,?,?,?,?) RETURNING id_auditoria`,
  [d.organizacion, d.objetivo, d.alcance, d.referentes || REFERENTES, d.fecha_inicio, d.fecha_fin, d.id_auditor]);
  await log(req.user.id_usuario, 'CREAR', 'auditoria', a.id_auditoria, d.organizacion);
  res.status(201).json(await getAuditoria(a.id_auditoria));
});

router.get('/auditorias/:id', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  const evaluaciones = await getEvaluaciones(aud.id_auditoria);
  const puedeEditar = req.user.rol === 'admin' || aud.id_auditor === req.user.id_usuario;
  res.json({ ...aud, puede_editar: puedeEditar, evaluaciones, indicadores: calcularIndicadores(evaluaciones.map((e) => e.estado)) });
});

router.put('/auditorias/:id', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  assertEditable(aud, req.user);
  const d = await validarAuditoria({ ...req.body, id_auditor: req.body.id_auditor ?? aud.id_auditor }, req.user);
  if (req.user.rol !== 'admin') d.id_auditor = aud.id_auditor;
  await query(`UPDATE auditoria SET organizacion=?, objetivo=?, alcance=?, referentes=?, fecha_inicio=?, fecha_fin=?, id_auditor=?, actualizado_en=now()
    WHERE id_auditoria=?`, [d.organizacion, d.objetivo, d.alcance, d.referentes || aud.referentes, d.fecha_inicio, d.fecha_fin, d.id_auditor, aud.id_auditoria]);
  await log(req.user.id_usuario, 'ACTUALIZAR', 'auditoria', aud.id_auditoria);
  res.json(await getAuditoria(aud.id_auditoria));
});

router.delete('/auditorias/:id', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  assertEditable(aud, req.user);
  if (aud.estado !== 'BORRADOR') throw new HttpError(409, 'Solo se pueden eliminar auditorías en estado BORRADOR.');
  await query('DELETE FROM auditoria WHERE id_auditoria = ?', [aud.id_auditoria]);
  await log(req.user.id_usuario, 'ELIMINAR', 'auditoria', aud.id_auditoria, aud.organizacion);
  res.json({ ok: true });
});

// Selección de controles (10 a 15). Se permite en BORRADOR y EN_EJECUCION.
router.put('/auditorias/:id/controles', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  assertEditable(aud, req.user);
  if (!['BORRADOR', 'EN_EJECUCION'].includes(aud.estado))
    throw new HttpError(409, 'La selección de controles solo puede modificarse en BORRADOR o EN_EJECUCION.');
  const ids = Array.isArray(req.body.controles) ? [...new Set(req.body.controles.map(Number))] : null;
  if (!ids || ids.some((n) => !Number.isInteger(n) || n <= 0 || n > 2147483647)) throw new ValidationError({ controles: 'Envíe una lista de identificadores de control.' });
  if (ids.length > MAX_CONTROLES) throw new ValidationError({ controles: `Puede seleccionar máximo ${MAX_CONTROLES} controles (seleccionó ${ids.length}).` });
  if (aud.estado === 'EN_EJECUCION' && ids.length < MIN_CONTROLES)
    throw new ValidationError({ controles: `Con la auditoría en ejecución la selección debe mantenerse entre ${MIN_CONTROLES} y ${MAX_CONTROLES} controles.` });
  const existentes = new Set((await all('SELECT id_control FROM control WHERE activo = 1 AND id_control = ANY(?::int[])', [ids])).map((c) => c.id_control));
  const invalidos = ids.filter((n) => !existentes.has(n));
  if (invalidos.length) throw new ValidationError({ controles: `Controles inexistentes o inactivos: ${invalidos.join(', ')}.` });

  await tx(async () => {
    const actuales = await getEvaluaciones(aud.id_auditoria);
    for (const e of actuales) {
      if (!ids.includes(e.id_control)) {
        if (e.n_evidencias || e.n_hallazgos)
          throw new HttpError(409, `No se puede quitar el control ${e.codigo_iso}: tiene evidencias o hallazgos asociados.`);
        await query('DELETE FROM evaluacion_control WHERE id_evaluacion = ?', [e.id_evaluacion]);
      }
    }
    for (const cid of ids)
      await query('INSERT INTO evaluacion_control (id_auditoria, id_control) VALUES (?, ?) ON CONFLICT (id_auditoria, id_control) DO NOTHING', [aud.id_auditoria, cid]);
    await touch(aud.id_auditoria);
  });
  await log(req.user.id_usuario, 'SELECCION_CONTROLES', 'auditoria', aud.id_auditoria, ids.join(','));
  res.json({ seleccionados: ids.length, evaluaciones: await getEvaluaciones(aud.id_auditoria) });
});

// Verificar requisitos de una transición sin aplicarla (para mostrar alertas en la UI)
router.get('/auditorias/:id/verificar', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  const destino = String(req.query.destino || '');
  res.json({ destino, problemas: await verificarTransicion(aud, destino) });
});

// Cambio de estado del ciclo de vida
router.post('/auditorias/:id/estado', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  assertEditable(aud, req.user);
  const { estado } = validate(req.body, { estado: [r.required('El estado'), r.oneOf(ESTADOS_AUDITORIA, 'El estado')] });
  if (ESTADOS_AUDITORIA.indexOf(estado) > ESTADOS_AUDITORIA.indexOf(aud.estado)) {
    const problemas = await verificarTransicion(aud, estado);
    if (problemas.length) throw new HttpError(422, `No es posible pasar a ${estado}.`, { problemas });
  }
  await query('UPDATE auditoria SET estado = ?, actualizado_en = now() WHERE id_auditoria = ?', [estado, aud.id_auditoria]);
  await log(req.user.id_usuario, 'CAMBIO_ESTADO', 'auditoria', aud.id_auditoria, `${aud.estado} -> ${estado}`);
  res.json(await getAuditoria(aud.id_auditoria));
});

// Trazabilidad extremo a extremo: control → evaluación → evidencias → hallazgos → recomendaciones
router.get('/auditorias/:id/trazabilidad', async (req, res) => {
  const aud = await getAuditoria(id(req.params.id));
  const [evals, evid, halls, informes] = await Promise.all([
    getEvaluaciones(aud.id_auditoria), getEvidencias(aud.id_auditoria), getHallazgos(aud.id_auditoria),
    all('SELECT id_informe, version, generado_en FROM informe WHERE id_auditoria = ? ORDER BY version DESC', [aud.id_auditoria]),
  ]);
  const filas = evals.map((e) => {
    const evidencias = evid.filter((v) => v.id_evaluacion === e.id_evaluacion);
    const hallazgos = halls.filter((h) => h.id_evaluacion === e.id_evaluacion);
    const alertas = [];
    if (e.estado === 'PENDIENTE') alertas.push('Sin evaluar');
    if (['IMPLEMENTADO', 'PARCIAL'].includes(e.estado) && !evidencias.length) alertas.push('Sin evidencia');
    if (e.estado === 'NO_IMPLEMENTADO' && !hallazgos.length) alertas.push('No implementado sin hallazgo');
    hallazgos.filter((h) => !h.recomendaciones.length).forEach((h) => alertas.push(`${h.codigo} sin recomendación`));
    return {
      id_evaluacion: e.id_evaluacion, codigo_iso: e.codigo_iso, control_nombre: e.control_nombre, estado: e.estado,
      evidencias: evidencias.map(({ codigo, descripcion, tipo, es_simulada }) => ({ codigo, descripcion, tipo, es_simulada })),
      hallazgos: hallazgos.map(({ codigo, severidad, recomendaciones }) => ({ codigo, severidad, recomendaciones: recomendaciones.map(({ codigo, descripcion }) => ({ codigo, descripcion })) })),
      alertas,
    };
  });
  res.json({ auditoria: aud, filas, informes });
});

export default router;
