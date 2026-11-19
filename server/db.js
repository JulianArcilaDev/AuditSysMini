import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.AUDITSYS_DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = process.env.AUDITSYS_DB || path.join(DATA_DIR, 'auditsys.db');
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = undefined; }
}

/** Ejecuta fn dentro de una transacción. */
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const r = fn(d);
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function log(idUsuario, accion, entidad, idEntidad, detalle) {
  getDb().prepare('INSERT INTO bitacora (id_usuario, accion, entidad, id_entidad, detalle) VALUES (?,?,?,?,?)')
    .run(idUsuario ?? null, accion, entidad, idEntidad ?? null, detalle ? String(detalle).slice(0, 500) : null);
}

/** Siguiente código secuencial por auditoría, p. ej. H-01, EV-12. */
export function nextCode(prefix, sql, idAuditoria) {
  const rows = getDb().prepare(sql).all(idAuditoria);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(String(r.codigo).split('-')[1], 10);
    if (n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}
