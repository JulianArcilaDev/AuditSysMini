// RF09 · Dashboard: cuadro integral de indicadores de gestión de auditorías.
// Todos los valores se calculan desde la BD con la misma función que usa el informe.
import { Router } from 'express';
import { getDb } from '../db.js';
import { calcularIndicadores, getAuditoria, FORMULAS } from '../services/auditoria.js';
import { CATEGORIAS } from '../validators.js';

const router = Router();

router.get('/dashboard', (req, res) => {
  const db = getDb();
  const idAud = req.query.auditoria ? Number(req.query.auditoria) : null;
  if (idAud) getAuditoria(idAud); // 404 si no existe
  const filtro = idAud ? 'WHERE e.id_auditoria = ?' : '';
  const params = idAud ? [idAud] : [];

  const evals = db.prepare(`SELECT e.estado, e.id_auditoria, c.categoria FROM evaluacion_control e JOIN control c ON c.id_control = e.id_control ${filtro}`).all(...params);
  const indicadores = calcularIndicadores(evals.map((e) => e.estado));

  const porCategoria = CATEGORIAS.map((cat) => ({ categoria: cat, ...calcularIndicadores(evals.filter((e) => e.categoria === cat).map((e) => e.estado)) }));

  const hall = db.prepare(`SELECT severidad, COUNT(*) n FROM hallazgo ${idAud ? 'WHERE id_auditoria = ?' : ''} GROUP BY severidad`).all(...params);
  const hallazgos = { ALTA: 0, MEDIA: 0, BAJA: 0 };
  hall.forEach((h) => (hallazgos[h.severidad] = h.n));

  const recs = db.prepare(`SELECT COUNT(*) n, ROUND(AVG(r.plazo_dias)) plazo FROM recomendacion r JOIN hallazgo h ON h.id_hallazgo = r.id_hallazgo ${idAud ? 'WHERE h.id_auditoria = ?' : ''}`).get(...params);
  const sinRec = db.prepare(`SELECT COUNT(*) n FROM hallazgo h WHERE NOT EXISTS (SELECT 1 FROM recomendacion r WHERE r.id_hallazgo = h.id_hallazgo) ${idAud ? 'AND h.id_auditoria = ?' : ''}`).get(...params).n;
  const evidencias = db.prepare(`SELECT COUNT(*) n, SUM(es_simulada) sim FROM evidencia v JOIN evaluacion_control e ON e.id_evaluacion = v.id_evaluacion ${filtro}`).get(...params);

  const auds = db.prepare(`SELECT a.id_auditoria, a.organizacion, a.estado, a.fecha_inicio, a.fecha_fin, a.actualizado_en, u.nombre AS auditor_nombre
    FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_auditor ORDER BY a.actualizado_en DESC`).all();
  const est = db.prepare('SELECT estado FROM evaluacion_control WHERE id_auditoria = ?');
  const nh = db.prepare('SELECT COUNT(*) n FROM hallazgo WHERE id_auditoria = ?');
  const auditorias = auds.map((a) => {
    const ind = calcularIndicadores(est.all(a.id_auditoria).map((e) => e.estado));
    return { ...a, cumplimiento_base: ind.cumplimiento_base, indice_ponderado: ind.indice_ponderado, avance: ind.avance, seleccionados: ind.seleccionados, n_hallazgos: nh.get(a.id_auditoria).n };
  });
  const porEstadoAuditoria = { BORRADOR: 0, EN_EJECUCION: 0, EN_REVISION: 0, CERRADA: 0 };
  auditorias.forEach((a) => porEstadoAuditoria[a.estado]++);
  const conIndicador = auditorias.filter((a) => a.cumplimiento_base !== null);
  const promedio = conIndicador.length ? Math.round((10 * conIndicador.reduce((s, a) => s + a.cumplimiento_base, 0)) / conIndicador.length) / 10 : null;

  res.json({
    filtro_auditoria: idAud,
    indicadores,
    por_categoria: porCategoria,
    hallazgos_por_severidad: hallazgos,
    total_hallazgos: hallazgos.ALTA + hallazgos.MEDIA + hallazgos.BAJA,
    hallazgos_sin_recomendacion: sinRec,
    recomendaciones: { total: recs.n, plazo_promedio_dias: recs.plazo },
    evidencias: { total: evidencias.n, simuladas: evidencias.sim || 0 },
    auditorias,
    auditorias_por_estado: porEstadoAuditoria,
    cumplimiento_promedio: promedio,
    formulas: FORMULAS,
  });
});

export default router;
