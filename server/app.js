import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import controlesRoutes from './routes/controles.js';
import auditoriasRoutes from './routes/auditorias.js';
import evaluacionesRoutes from './routes/evaluaciones.js';
import hallazgosRoutes from './routes/hallazgos.js';
import informesRoutes from './routes/informes.js';
import dashboardRoutes from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  // Cabeceras de seguridad básicas
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'");
    next();
  });

  app.use(express.json({ limit: '8mb' }));

  // API (todas las rutas excepto login requieren sesión)
  app.use('/api', authRoutes);
  app.use('/api', requireAuth, controlesRoutes, auditoriasRoutes, evaluacionesRoutes, hallazgosRoutes, informesRoutes, dashboardRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

  // Frontend estático (SPA con rutas hash)
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  // Manejo centralizado de errores
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud supera el tamaño máximo permitido.' });
    if (err.status) {
      const body = { error: err.message };
      if (err.fields) body.fields = err.fields;
      if (err.problemas) body.problemas = err.problemas;
      return res.status(err.status).json(body);
    }
    const msg = String(err.message || '');
    if (msg.includes('UNIQUE constraint failed')) {
      const campo = msg.split('.').pop();
      return res.status(409).json({ error: `Ya existe un registro con el mismo valor (${campo}).`, fields: { [campo]: 'Valor duplicado.' } });
    }
    if (msg.includes('CHECK constraint failed') || msg.includes('FOREIGN KEY constraint failed') || msg.includes('NOT NULL constraint failed'))
      return res.status(400).json({ error: 'Los datos no cumplen las reglas de integridad de la base de datos.', detalle: msg });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}
