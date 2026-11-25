import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import { one } from './db.js';
import authRoutes from './routes/auth.js';
import controlesRoutes from './routes/controles.js';
import auditoriasRoutes from './routes/auditorias.js';
import evaluacionesRoutes from './routes/evaluaciones.js';
import hallazgosRoutes from './routes/hallazgos.js';
import informesRoutes from './routes/informes.js';
import dashboardRoutes from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Códigos de error de PostgreSQL → respuestas HTTP comprensibles
const PG_ERRORS = {
  23505: [409, 'Ya existe un registro con el mismo valor.'],
  23514: [400, 'Los datos no cumplen las reglas de integridad de la base de datos.'],
  23503: [400, 'El registro referenciado no existe (integridad referencial).'],
  23502: [400, 'Falta un dato obligatorio.'],
  '22P02': [400, 'Formato de dato no válido.'],
  22007: [400, 'Fecha no válida.'],
  22008: [400, 'Fecha fuera de rango.'],
  22001: [400, 'Un texto supera la longitud permitida.'],
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Render (y otros PaaS) ponen un proxy delante: TRUST_PROXY=1 para que req.ip sea la IP real del cliente
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : 'loopback');

  // Cabeceras de seguridad básicas
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'");
    next();
  });

  // Salud del servicio (Render Health Check Path). /health no consulta la BD; /api/health sí.
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auditsys-mini', version: pkg.version }));
  app.get('/api/health', async (req, res) => {
    const r = await one('SELECT now() AS server_time, version() AS version');
    res.json({ status: 'ok', database: 'postgresql', serverTime: r.server_time, version: r.version.split(' on ')[0] });
  });

  app.use(express.json({ limit: '8mb' }));
  app.use((req, res, next) => { req.body ??= {}; next(); });

  // API (todas las rutas excepto login requieren sesión)
  app.use('/api', authRoutes);
  app.use('/api', requireAuth, controlesRoutes, auditoriasRoutes, evaluacionesRoutes, hallazgosRoutes, informesRoutes, dashboardRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

  // Frontend estático (SPA con rutas hash)
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  // Manejo centralizado de errores (Express 5 captura también los errores de funciones async)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud supera el tamaño máximo permitido.' });
    if (err.status && !err.code) {
      const body = { error: err.message };
      if (err.fields) body.fields = err.fields;
      if (err.problemas) body.problemas = err.problemas;
      return res.status(err.status).json(body);
    }
    const mapped = PG_ERRORS[err.code];
    if (mapped) {
      const body = { error: mapped[1] };
      if (err.constraint) body.detalle = err.constraint;
      if (err.code === '23505' && err.constraint === 'ux_usuario_correo') body.fields = { correo: 'Ya existe un usuario con este correo.' };
      if (err.code === '23505' && err.constraint === 'control_codigo_iso_key') body.fields = { codigo_iso: 'Ya existe un control con este código.' };
      return res.status(mapped[0]).json(body);
    }
    if (['ECONNREFUSED', 'ENOTFOUND', '57P01', '53300'].includes(err.code))
      return res.status(503).json({ error: 'La base de datos no está disponible. Intente de nuevo en unos segundos.' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}
