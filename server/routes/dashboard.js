// RF09 · Dashboard: cuadro integral de indicadores de gestión de auditorías.
// Todos los valores se calculan desde la BD con la misma función que usa el informe.
import { Router } from 'express';
import { all, one } from '../db.js';
import { calcularIndicadores, getAuditoria, FORMULAS } from '../services/auditoria.js';
import { CATEGORIAS } from '../validators.js';
import { id } from './helpers.js';

const router = Router();

router.get('/dashboard', async (req, res) => {
  const idAud = req.query.auditoria ? id(req.query.auditoria) : null;
  if (idAud) await getAuditoria(idAud); // 404 si no existe
  // Con filtro: "? IS NULL OR columna = ?" permite usar la misma consulta con o sin auditoría
  const p = [idAud, idAud];

  const [evals, hall, recs, sinRecRow, evidencias, auds, estadosAud, nHall] = await Promise.all([
    all(`SELECT e.estado, e.id_auditoria, c.categoria FROM evaluacion_control e JOIN control c ON c.id_control = e.id_control
      WHERE ?::int IS NULL OR e.id_auditoria = ?`, p),
    all('SELECT severidad, COUNT(*) AS n FROM hallazgo WHERE ?::int IS NULL OR id_auditoria = ? GROUP BY severidad', p),
    one(`SELECT COUNT(*) AS n, ROUND(AVG(r.plazo_dias))::int AS plazo FROM recomendacion r JOIN hallazgo h ON h.id_hallazgo = r.id_hallazgo
      WHERE ?::int IS NULL OR h.id_auditoria = ?`, p),
    one(`SELECT COUNT(*) AS n FROM hallazgo h WHERE NOT EXISTS (SELECT 1 FROM recomendacion r WHERE r.id_hallazgo = h.id_hallazgo)
      AND (?::int IS NULL OR h.id_auditoria = ?)`, p),
    one(`SELECT COUNT(*) AS n, COALESCE(SUM(v.es_simulada), 0) AS sim FROM evidencia v JOIN evaluacion_control e ON e.id_evaluacion = v.id_evaluacion
      WHERE ?::int IS NULL OR e.id_auditoria = ?`, p),
    all(`SELECT a.id_auditoria, a.organizacion, a.estado, a.fecha_inicio, a.fecha_fin, a.actualizado_en, u.nombre AS auditor_nombre
      FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_auditor ORDER BY a.actualizado_en DESC`),
    all('SELECT id_auditoria, estado FROM evaluacion_control'),
    all('SELECT id_auditoria, COUNT(*) AS n FROM hallazgo GROUP BY id_auditoria'),
  ]);

  const indicadores = calcularIndicadores(evals.map((e) => e.estado));
  const porCategoria = CATEGORIAS.map((cat) => ({ categoria: cat, ...calcularIndicadores(evals.filter((e) => e.categoria === cat).map((e) => e.estado)) }));
  const hallazgos = { ALTA: 0, MEDIA: 0, BAJA: 0 };
  hall.forEach((h) => (hallazgos[h.severidad] = h.n));

  const auditorias = auds.map((a) => {
    const ind = calcularIndicadores(estadosAud.filter((e) => e.id_auditoria === a.id_auditoria).map((e) => e.estado));
    return {
      ...a, cumplimiento_base: ind.cumplimiento_base, indice_ponderado: ind.indice_ponderado, avance: ind.avance,
      seleccionados: ind.seleccionados, n_hallazgos: nHall.find((h) => h.id_auditoria === a.id_auditoria)?.n || 0,
    };
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
    hallazgos_sin_recomendacion: sinRecRow.n,
    recomendaciones: { total: recs.n, plazo_promedio_dias: recs.plazo },
    evidencias: { total: evidencias.n, simuladas: evidencias.sim },
    auditorias,
    auditorias_por_estado: porEstadoAuditoria,
    cumplimiento_promedio: promedio,
    formulas: FORMULAS,
  });
});

export default router;
