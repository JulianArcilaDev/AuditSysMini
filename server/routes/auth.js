import { Router } from 'express';
import { getDb, log } from '../db.js';
import {
  verifyPassword, createToken, setSessionCookie, clearSessionCookie,
  requireAuth, requireAdmin, loginRateLimit, resetRateLimit, hashPassword,
} from '../auth.js';
import { validate, r, HttpError } from '../validators.js';
import { id } from './helpers.js';

const router = Router();

router.post('/auth/login', loginRateLimit, (req, res) => {
  const { correo, password } = validate(req.body, {
    correo: [r.required('El correo'), r.email('El correo')],
    password: [r.required('La contraseña')],
  });
  const user = getDb().prepare('SELECT * FROM usuario WHERE correo = ?').get(correo);
  if (!user || !user.activo || !verifyPassword(password, user.password_hash)) {
    log(null, 'LOGIN_FALLIDO', 'usuario', null, correo);
    throw new HttpError(401, 'Credenciales incorrectas.');
  }
  resetRateLimit(req);
  setSessionCookie(res, createToken(user));
  log(user.id_usuario, 'LOGIN', 'usuario', user.id_usuario);
  res.json({ id_usuario: user.id_usuario, nombre: user.nombre, correo: user.correo, rol: user.rol });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => res.json(req.user));

// ---- Administración de usuarios (solo admin) ----
router.get('/usuarios', requireAuth, (req, res) => {
  // Los auditores pueden listar (para asignar responsable); solo admin ve correos completos y estado.
  const rows = getDb().prepare('SELECT id_usuario, nombre, correo, rol, activo, creado_en FROM usuario ORDER BY nombre').all();
  res.json(req.user.rol === 'admin' ? rows : rows.filter((u) => u.activo).map(({ id_usuario, nombre, rol }) => ({ id_usuario, nombre, rol })));
});

router.post('/usuarios', requireAuth, requireAdmin, (req, res) => {
  const data = validate(req.body, {
    nombre: [r.required('El nombre'), r.min(3, 'El nombre'), r.max(100, 'El nombre')],
    correo: [r.required('El correo'), r.email('El correo')],
    password: [r.required('La contraseña'), r.min(8, 'La contraseña')],
    rol: [r.required('El rol'), r.oneOf(['auditor', 'admin'], 'El rol')],
  });
  if (!/[A-Za-z]/.test(data.password) || !/\d/.test(data.password))
    throw new HttpError(400, 'Revise los campos marcados.', { fields: { password: 'La contraseña debe combinar letras y números.' } });
  const info = getDb().prepare('INSERT INTO usuario (nombre, correo, password_hash, rol) VALUES (?,?,?,?)')
    .run(data.nombre, data.correo, hashPassword(data.password), data.rol);
  log(req.user.id_usuario, 'CREAR', 'usuario', Number(info.lastInsertRowid), data.correo);
  res.status(201).json({ id_usuario: Number(info.lastInsertRowid) });
});

router.patch('/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const uid = id(req.params.id);
  if (uid === req.user.id_usuario) throw new HttpError(400, 'No puede modificar su propio usuario desde aquí.');
  const data = validate(req.body, { activo: [r.int(0, 1, 'Activo')], rol: [r.oneOf(['auditor', 'admin'], 'El rol')] });
  const u = getDb().prepare('SELECT * FROM usuario WHERE id_usuario = ?').get(uid);
  if (!u) throw new HttpError(404, 'Usuario no encontrado.');
  getDb().prepare('UPDATE usuario SET activo = ?, rol = ? WHERE id_usuario = ?')
    .run(data.activo ?? u.activo, data.rol ?? u.rol, uid);
  log(req.user.id_usuario, 'ACTUALIZAR', 'usuario', uid, JSON.stringify(data));
  res.json({ ok: true });
});

export default router;
