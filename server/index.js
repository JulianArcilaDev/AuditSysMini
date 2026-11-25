import { createApp } from './app.js';
import { initDb, closeDb, dbConfig } from './db.js';
import { initSecret } from './auth.js';
import { seedIfEmpty } from './seed.js';

async function waitForDb(retries = 10) {
  for (let i = 1; ; i++) {
    try { await initDb(); return; } catch (err) {
      if (i >= retries) throw err;
      console.log(`Esperando a PostgreSQL (${err.code || err.message}) · intento ${i}/${retries}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function bootstrap() {
  const cfg = dbConfig();
  console.log(`Conectando a PostgreSQL en ${cfg.connectionString ? 'DATABASE_URL' : `${cfg.host}:${cfg.port}/${cfg.database}`}`);
  await waitForDb();
  console.log('PostgreSQL connected · esquema verificado');
  await initSecret();
  await seedIfEmpty();

  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '127.0.0.1';
  const server = createApp().listen(PORT, HOST, () => {
    console.log(`AuditSys Mini escuchando en http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });

  const shutdown = (sig) => {
    console.log(`${sig} recibido: cerrando servidor…`);
    server.close(async () => { await closeDb(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message || error);
  process.exit(1);
});
