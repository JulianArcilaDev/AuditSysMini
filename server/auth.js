// Autenticación (RNF04): contraseñas con scrypt + sal, token firmado HMAC-SHA256
// enviado en cookie HttpOnly/SameSite=Strict. Roles: 'auditor' y 'admin'.
import crypto from 'node:crypto';
import { one, query } from './db.js';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas
export const COOKIE = 'auditsys_session';

let SECRET = null;

/** Carga la clave de firma: AUDITSYS_SECRET o, si no existe, una aleatoria guardada en la BD. */
export async function initSecret() {
  if (process.env.AUDITSYS_SECRET) { SECRET = process.env.AUDITSYS_SECRET; return; }
  await query("INSERT INTO app_config (clave, valor) VALUES ('session_secret', ?) ON CONFLICT (clave) DO NOTHING", [crypto.randomBytes(48).toString('hex')]);
  SECRET = (await one("SELECT valor FROM app_config WHERE clave = 'session_secret'")).valor;
}
const secret = () => {
  if (!SECRET) throw new Error('La clave de sesión no se ha inicializado.');
  return SECRET;
};

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
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
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

// Cookie Secure: por defecto en producción (Render sirve HTTPS). COOKIE_SECURE=false para Docker local por HTTP.
const cookieSecure = () => (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production');

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TOKEN_TTL_MS / 1000}${cookieSecure() ? '; Secure' : ''}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecure() ? '; Secure' : ''}`);
}

/** Middleware: exige sesión válida y usuario activo. */
export async function requireAuth(req, res, next) {
  const data = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  if (!data) return res.status(401).json({ error: 'Sesión no válida o expirada. Inicie sesión.' });
  const user = await one('SELECT id_usuario, nombre, correo, rol, activo FROM usuario WHERE id_usuario = ?', [data.sub]);
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
