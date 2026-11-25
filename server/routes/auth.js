import { Router } from 'express';
import { all, one, query, log } from '../db.js';
import {
  verifyPassword, createToken, setSessionCookie, clearSessionCookie,
  requireAuth, requireAdmin, loginRateLimit, resetRateLimit, hashPassword,
} from '../auth.js';
import { validate, r, HttpError } from '../validators.js';
import { id } from './helpers.js';

const router = Router();

router.post('/auth/login', loginRateLimit, async (req, res) => {
  const { correo, password } = validate(req.body, {
    correo: [r.required('El correo'), r.email('El correo')],
    password: [r.required('La contraseña')],
  });
  const user = await one('SELECT * FROM usuario WHERE correo = ?', [correo.toLowerCase()]);
  if (!user || !user.activo || !verifyPassword(password, user.password_hash)) {
    await log(null, 'LOGIN_FALLIDO', 'usuario', null, correo);
    throw new HttpError(401, 'Credenciales incorrectas.');
  }
  resetRateLimit(req);
  setSessionCookie(res, createToken(user));
  await log(user.id_usuario, 'LOGIN', 'usuario', user.id_usuario);
  res.json({ id_usuario: user.id_usuario, nombre: user.nombre, correo: user.correo, rol: user.rol });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => res.json(req.user));

// ---- Administración de usuarios ----
router.get('/usuarios', requireAuth, async (req, res) => {
  // Los auditores pueden listar (para asignar responsable); solo admin ve correos completos y estado.
  const rows = await all('SELECT id_usuario, nombre, correo, rol, activo, creado_en FROM usuario ORDER BY nombre');
  res.json(req.user.rol === 'admin' ? rows : rows.filter((u) => u.activo).map(({ id_usuario, nombre, rol }) => ({ id_usuario, nombre, rol })));
});

router.post('/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const data = validate(req.body, {
    nombre: [r.required('El nombre'), r.min(3, 'El nombre'), r.max(100, 'El nombre')],
    correo: [r.required('El correo'), r.email('El correo')],
    password: [r.required('La contraseña'), r.min(8, 'La contraseña')],
    rol: [r.required('El rol'), r.oneOf(['auditor', 'admin'], 'El rol')],
  });
  if (!/[A-Za-z]/.test(data.password) || !/\d/.test(data.password))
    throw new HttpError(400, 'Revise los campos marcados.', { fields: { password: 'La contraseña debe combinar letras y números.' } });
  const u = await one('INSERT INTO usuario (nombre, correo, password_hash, rol) VALUES (?,?,?,?) RETURNING id_usuario',
    [data.nombre, data.correo.toLowerCase(), hashPassword(data.password), data.rol]);
  await log(req.user.id_usuario, 'CREAR', 'usuario', u.id_usuario, data.correo);
  res.status(201).json(u);
});

router.patch('/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const uid = id(req.params.id);
  if (uid === req.user.id_usuario) throw new HttpError(400, 'No puede modificar su propio usuario desde aquí.');
  const data = validate(req.body, { activo: [r.int(0, 1, 'Activo')], rol: [r.oneOf(['auditor', 'admin'], 'El rol')] });
  const u = await one('SELECT * FROM usuario WHERE id_usuario = ?', [uid]);
  if (!u) throw new HttpError(404, 'Usuario no encontrado.');
  await query('UPDATE usuario SET activo = ?, rol = ? WHERE id_usuario = ?', [data.activo ?? u.activo, data.rol ?? u.rol, uid]);
  await log(req.user.id_usuario, 'ACTUALIZAR', 'usuario', uid, JSON.stringify(data));
  res.json({ ok: true });
});

export default router;
