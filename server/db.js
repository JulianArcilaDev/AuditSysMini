// Capa de acceso a datos: PostgreSQL con el driver `pg`.
// - Las consultas usan marcadores `?` que se traducen a $1, $2... (consultas parametrizadas).
// - tx() ejecuta una función dentro de una transacción; las consultas hechas dentro
//   usan automáticamente la misma conexión (AsyncLocalStorage).
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tipos: DATE como 'AAAA-MM-DD', COUNT/SUM (int8) y NUMERIC como número.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

/** Configuración: DATABASE_URL o variables POSTGRES_* por separado (como en la guía de Render). */
export function dbConfig() {
  const ssl = ['1', 'true', 'require'].includes(String(process.env.PGSSL || '').toLowerCase()) ? { rejectUnauthorized: false } : undefined;
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL, ssl };
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'auditsys',
    password: process.env.POSTGRES_PASSWORD || 'auditsys',
    database: process.env.POSTGRES_DB || 'auditsys',
    ssl,
  };
}

let pool;
const txStore = new AsyncLocalStorage();

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({ ...dbConfig(), max: Number(process.env.PG_POOL_MAX) || 10 });
    pool.on('error', (err) => console.error('Error inesperado en el pool de PostgreSQL:', err.message));
  }
  return pool;
}

export async function closeDb() {
  if (pool) { const p = pool; pool = undefined; await p.end(); }
}

/** Crea las tablas si no existen. */
export async function initDb() {
  await getPool().query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}

const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

/** Ejecuta una consulta y devuelve el resultado completo de pg ({ rows, rowCount }). */
export function query(sql, params = []) {
  const runner = txStore.getStore() || getPool();
  return runner.query(toPg(sql), params);
}
export const all = async (sql, params) => (await query(sql, params)).rows;
export const one = async (sql, params) => (await query(sql, params)).rows[0];

/** Ejecuta fn dentro de una transacción (BEGIN/COMMIT/ROLLBACK). */
export async function tx(fn) {
  if (txStore.getStore()) return fn();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const r = await txStore.run(client, fn);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function log(idUsuario, accion, entidad, idEntidad, detalle) {
  await query('INSERT INTO bitacora (id_usuario, accion, entidad, id_entidad, detalle) VALUES (?,?,?,?,?)',
    [idUsuario ?? null, accion, entidad, idEntidad ?? null, detalle ? String(detalle).slice(0, 500) : null]);
}

/** Siguiente código secuencial por auditoría, p. ej. H-01, EV-12. */
export async function nextCode(prefix, sql, idAuditoria) {
  const rows = await all(sql, [idAuditoria]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(String(r.codigo).split('-')[1], 10);
    if (n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}
