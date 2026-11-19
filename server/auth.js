// Autenticación (RNF04): contraseñas con scrypt + sal, token firmado HMAC-SHA256
// enviado en cookie HttpOnly/SameSite=Strict. Roles: 'auditor' y 'admin'.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getDb } from './db.js';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas
export const COOKIE = 'auditsys_session';

function loadSecret() {
  if (process.env.AUDITSYS_SECRET) return process.env.AUDITSYS_SECRET;
  const f = path.join(DATA_DIR, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}
let SECRET;
const secret = () => (SECRET ??= loadSecret());

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(plain), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function createToken(user) {
  const payload = b64(JSON.stringify({ sub: user.id_usuario, rol: user.rol, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter((p) => p[0])
    .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TOKEN_TTL_MS / 1000}${secure}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

/** Middleware: exige sesión válida y usuario activo. */
export function requireAuth(req, res, next) {
  const data = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  if (!data) return res.status(401).json({ error: 'Sesión no válida o expirada. Inicie sesión.' });
  const user = getDb().prepare('SELECT id_usuario, nombre, correo, rol, activo FROM usuario WHERE id_usuario = ?').get(data.sub);
  if (!user || !user.activo) return res.status(401).json({ error: 'Usuario inactivo o inexistente.' });
  req.user = user;
  next();
}

/** Middleware: exige rol administrador. */
export function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado: se requiere rol administrador.' });
  next();
}

// Limitador simple de intentos de login por IP (5 intentos / 5 min)
const attempts = new Map();
export function loginRateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 5 * 60 * 1000);
  if (a.length >= 5) return res.status(429).json({ error: 'Demasiados intentos. Espere unos minutos.' });
  a.push(now);
  attempts.set(key, a);
  next();
}
export function resetRateLimit(req) { attempts.delete(req.ip); }
