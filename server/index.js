import { createApp } from './app.js';
import { getDb } from './db.js';
import { seedIfEmpty } from './seed.js';

getDb();
seedIfEmpty();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
createApp().listen(PORT, HOST, () => {
  console.log(`AuditSys Mini escuchando en http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
