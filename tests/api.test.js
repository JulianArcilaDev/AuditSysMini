// Pruebas automatizadas de la API: casos CP-01 a CP-13 del plan de pruebas.
// Ejecutar: npm test   (usa una base de datos temporal; no toca los datos reales)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auditsys-test-'));
process.env.AUDITSYS_DATA_DIR = tmp;
process.env.AUDITSYS_SECRET = 'test-secret';

const { getDb, closeDb } = await import('../server/db.js');
const { seedIfEmpty } = await import('../server/seed.js');
const { createApp } = await import('../server/app.js');

let server;
let base;

before(async () => {
  getDb();
  seedIfEmpty();
  await new Promise((res) => { server = createApp().listen(0, '127.0.0.1', res); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); closeDb(); fs.rmSync(tmp, { recursive: true, force: true }); });

/** Cliente HTTP con cookie de sesión. */
function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return {
    get: (u) => call('GET', u), post: (u, b) => call('POST', u, b), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u),
    login: (correo, password) => call('POST', '/auth/login', { correo, password }),
  };
}

const ana = client();
const admin = client();
const carlos = client();
let audId;
let controles;
let evals = {};

const AUD = {
  organizacion: 'Empresa ABC Pruebas',
  objetivo: 'Evaluar controles seleccionados de ISO/IEC 27002:2022.',
  alcance: 'Servidores, estaciones de trabajo y aplicaciones empresariales.',
  fecha_inicio: '2026-11-09',
  fecha_fin: '2026-11-20',
};

test('Autenticación: rechaza credenciales inválidas y acceso sin sesión', async () => {
  const anon = client();
  assert.equal((await anon.get('/auditorias')).status, 401);
  assert.equal((await anon.login('ana@auditsys.local', 'mala')).status, 401);
  assert.equal((await ana.login('ana@auditsys.local', 'Auditor2026*')).status, 200);
  assert.equal((await admin.login('admin@auditsys.local', 'Admin2026*')).status, 200);
  assert.equal((await carlos.login('carlos@auditsys.local', 'Auditor2026*')).status, 200);
});

test('CP-01 Crear auditoría válida → queda en BORRADOR y aparece en la lista', async () => {
  const r = await ana.post('/auditorias', AUD);
  assert.equal(r.status, 201);
  assert.equal(r.data.estado, 'BORRADOR');
  audId = r.data.id_auditoria;
  const list = await ana.get('/auditorias');
  assert.ok(list.data.some((a) => a.id_auditoria === audId && a.estado === 'BORRADOR'));
});

test('CP-02 Crear auditoría incompleta → mensaje por campo y no se guarda', async () => {
  const antes = (await ana.get('/auditorias')).data.length;
  const r = await ana.post('/auditorias', { ...AUD, fecha_fin: '' });
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.fecha_fin);
  const r2 = await ana.post('/auditorias', { ...AUD, fecha_fin: '2026-11-01' });
  assert.equal(r2.status, 400);
  assert.match(r2.data.fields.fecha_fin, /posterior/);
  assert.equal((await ana.get('/auditorias')).data.length, antes);
});

test('CP-03 Selección fuera de rango (9 y 16) → bloquea el paso a ejecución', async () => {
  controles = (await ana.get('/controles')).data;
  assert.equal(controles.length, 93);
  const pick = (codes) => codes.map((c) => controles.find((x) => x.codigo_iso === c).id_control);
  const nueve = pick(['5.1', '5.15', '5.18', '5.24', '6.3', '7.2', '8.5', '8.7', '8.8']);
  assert.equal((await ana.put(`/auditorias/${audId}/controles`, { controles: nueve })).status, 200);
  const r = await ana.post(`/auditorias/${audId}/estado`, { estado: 'EN_EJECUCION' });
  assert.equal(r.status, 422);
  assert.match(r.data.problemas[0], /entre 10 y 15/);
  const dieciseis = controles.slice(0, 16).map((c) => c.id_control);
  const r16 = await ana.put(`/auditorias/${audId}/controles`, { controles: dieciseis });
  assert.equal(r16.status, 400);
  // selección válida de 13
  const trece = pick(['5.1', '5.15', '5.18', '5.24', '6.3', '7.2', '8.5', '8.7', '8.8', '8.13', '8.15', '8.23', '8.31']);
  assert.equal((await ana.put(`/auditorias/${audId}/controles`, { controles: trece })).data.seleccionados, 13);
  assert.equal((await ana.post(`/auditorias/${audId}/estado`, { estado: 'EN_EJECUCION' })).status, 200);
  const det = await ana.get(`/auditorias/${audId}`);
  det.data.evaluaciones.forEach((e) => (evals[e.codigo_iso] = e.id_evaluacion));
});

test('CP-04 Evaluar sin observación → se rechaza', async () => {
  const r = await ana.put(`/evaluaciones/${evals['5.18']}`, { estado: 'PARCIAL', observacion: '' });
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.observacion);
});

test('CP-05 No aplicable sin justificación → se rechaza; con justificación se guarda y sale del denominador', async () => {
  const r = await ana.put(`/evaluaciones/${evals['8.31']}`, { estado: 'NO_APLICABLE', observacion: 'No aplica al alcance.' });
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.justificacion_na);
  const ok = await ana.put(`/evaluaciones/${evals['8.31']}`, {
    estado: 'NO_APLICABLE', observacion: 'No aplica al alcance.', justificacion_na: 'La empresa no desarrolla software propio.',
  });
  assert.equal(ok.status, 200);
});

const PLAN = {
  '5.1': 'IMPLEMENTADO', '5.15': 'IMPLEMENTADO', '7.2': 'IMPLEMENTADO', '8.7': 'IMPLEMENTADO',
  '5.18': 'PARCIAL', '6.3': 'PARCIAL', '8.5': 'PARCIAL', '8.13': 'PARCIAL', '8.23': 'PARCIAL',
  '5.24': 'NO_IMPLEMENTADO', '8.8': 'NO_IMPLEMENTADO', '8.15': 'NO_IMPLEMENTADO',
};

test('CP-06 Implementado sin evidencia → alerta y bloqueo del paso a revisión', async () => {
  for (const [cod, estado] of Object.entries(PLAN)) {
    const r = await ana.put(`/evaluaciones/${evals[cod]}`, { estado, observacion: `Observación de prueba para ${cod}.` });
    assert.equal(r.status, 200);
    if (estado !== 'NO_IMPLEMENTADO') assert.equal(r.data.advertencias.length, 1);
  }
  const r = await ana.post(`/auditorias/${audId}/estado`, { estado: 'EN_REVISION' });
  assert.equal(r.status, 422);
  assert.ok(r.data.problemas.some((p) => p.includes('5.1')));
  // Evidencia sin referencia ni archivo → rechazada
  const bad = await ana.post(`/evaluaciones/${evals['5.1']}/evidencias`, { descripcion: 'Política', tipo: 'Documental', fuente: 'Gerencia', fecha: '2026-11-10' });
  assert.equal(bad.status, 400);
  // Se registran evidencias y ahora sí pasa
  for (const [cod, estado] of Object.entries(PLAN)) {
    if (estado === 'NO_IMPLEMENTADO') continue;
    const e = await ana.post(`/evaluaciones/${evals[cod]}/evidencias`, {
      descripcion: `Evidencia simulada ${cod}`, tipo: 'Documental', fuente: 'Líder de TI', fecha: '2026-11-10', referencia: `DOC-${cod}`,
    });
    assert.equal(e.status, 201);
    assert.match(e.data.codigo, /^EV-\d{2}$/);
  }
  // archivo adjunto en base64
  const f = await ana.post(`/evaluaciones/${evals['8.8']}/evidencias`, {
    descripcion: 'Acta de entrevista', tipo: 'Entrevista', fuente: 'Líder infra', fecha: '2026-11-11',
    archivo: { nombre: 'acta.txt', datos: Buffer.from('acta simulada').toString('base64') },
  });
  assert.equal(f.status, 201);
  const exe = await ana.post(`/evaluaciones/${evals['8.8']}/evidencias`, {
    descripcion: 'Archivo peligroso', tipo: 'Técnica', fuente: 'X', fecha: '2026-11-11', archivo: { nombre: 'x.exe', datos: 'AAAA' },
  });
  assert.equal(exe.status, 400);
  assert.equal((await ana.post(`/auditorias/${audId}/estado`, { estado: 'EN_REVISION' })).status, 200);
});

const H = (sev) => ({
  condicion: 'No se evidencian escaneos periódicos de vulnerabilidades.',
  criterio: 'ISO/IEC 27002:2022, control 8.8: gestión de vulnerabilidades técnicas.',
  causa: 'No hay responsable asignado.',
  efecto_riesgo: 'Mayor probabilidad de explotación de vulnerabilidades.',
  severidad: sev,
});
const R = { descripcion: 'Designar responsable y ejecutar escaneos mensuales.', prioridad: 'ALTA', plazo_dias: 60 };

test('CP-07 Hallazgo incompleto → rechazado; completo genera H-nn', async () => {
  const { causa, ...sinCausa } = H('ALTA');
  const r = await ana.post(`/evaluaciones/${evals['8.8']}/hallazgos`, sinCausa);
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.causa);
  const ok = await ana.post(`/evaluaciones/${evals['8.8']}/hallazgos`, { ...H('ALTA'), recomendacion: R });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.codigo, 'H-01');
  assert.equal(ok.data.recomendacion.codigo, 'R-01');
});

test('CP-08 Cierre sin recomendación o con menos de tres hallazgos → se impide', async () => {
  let r = await ana.post(`/auditorias/${audId}/estado`, { estado: 'CERRADA' });
  assert.equal(r.status, 422);
  assert.ok(r.data.problemas.some((p) => p.includes('al menos 3 hallazgos')));
  const h2 = await ana.post(`/evaluaciones/${evals['5.24']}/hallazgos`, H('ALTA'));
  await ana.post(`/evaluaciones/${evals['8.13']}/hallazgos`, { ...H('MEDIA'), recomendacion: { ...R, prioridad: 'MEDIA', plazo_dias: 90 } });
  r = await ana.post(`/auditorias/${audId}/estado`, { estado: 'CERRADA' });
  assert.equal(r.status, 422);
  assert.ok(r.data.problemas.some((p) => p.includes(h2.data.codigo)));
  assert.equal((await ana.post(`/hallazgos/${h2.data.id_hallazgo}/recomendaciones`, R)).status, 201);
});

test('CP-09 Cálculo de indicadores → 33,3 % base y 54,2 % ponderado', async () => {
  const { data } = await ana.get(`/auditorias/${audId}`);
  const i = data.indicadores;
  assert.deepEqual([i.implementados, i.parciales, i.no_implementados, i.no_aplicables, i.aplicables], [4, 5, 3, 1, 12]);
  assert.equal(i.cumplimiento_base, 33.3);
  assert.equal(i.indice_ponderado, 54.2);
});

test('CP-10 Generación de informe → coincide con la BD y marca evidencias simuladas', async () => {
  const g = await ana.post(`/auditorias/${audId}/informes`, {});
  assert.equal(g.status, 201);
  assert.equal(g.data.version, 1);
  const inf = (await ana.get(`/informes/${g.data.id_informe}`)).data;
  assert.equal(inf.cumplimiento_base, 33.3);
  assert.equal(inf.contenido.hallazgos.length, 3);
  assert.ok(inf.contenido.evidencias.every((e) => e.es_simulada === 1));
  assert.ok(inf.secciones.includes('limitaciones'));
  assert.match(inf.contenido.resumen, /no constituye certificación/);
  assert.equal((await ana.post(`/auditorias/${audId}/informes`, { secciones: ['datos'] })).data.version, 2);
});

test('CP-11 Dashboard → coincide con el informe', async () => {
  const d = (await ana.get(`/dashboard?auditoria=${audId}`)).data;
  assert.equal(d.indicadores.cumplimiento_base, 33.3);
  assert.equal(d.indicadores.indice_ponderado, 54.2);
  assert.equal(d.total_hallazgos, 3);
  assert.equal(d.hallazgos_por_severidad.ALTA, 2);
  const global = (await ana.get('/dashboard')).data;
  assert.ok(global.auditorias.length >= 2);
});

test('CP-12 Persistencia → los datos permanecen tras cerrar y reabrir la BD', async () => {
  closeDb();
  getDb();
  const { data } = await ana.get(`/auditorias/${audId}`);
  assert.equal(data.evaluaciones.length, 13);
  assert.equal(data.indicadores.cumplimiento_base, 33.3);
});

test('CP-13 Acceso por rol y auditoría cerrada → acceso denegado', async () => {
  // Auditor no puede editar el catálogo
  const c = await ana.post('/controles', { codigo_iso: '8.99', nombre: 'Prueba', categoria: 'Tecnológico', criterio: 'Criterio de prueba suficiente.' });
  assert.equal(c.status, 403);
  // Admin sí puede
  const ca = await admin.post('/controles', { codigo_iso: '8.99', nombre: 'Control de prueba', categoria: 'Tecnológico', criterio: 'Criterio de prueba suficiente.' });
  assert.equal(ca.status, 201);
  // Otro auditor no puede modificar una auditoría ajena
  assert.equal((await carlos.put(`/evaluaciones/${evals['5.1']}`, { estado: 'IMPLEMENTADO', observacion: 'Intento ajeno.' })).status, 403);
  // Cierre exitoso y luego edición bloqueada
  assert.equal((await ana.post(`/auditorias/${audId}/estado`, { estado: 'CERRADA' })).status, 200);
  const e = await ana.put(`/evaluaciones/${evals['5.1']}`, { estado: 'PARCIAL', observacion: 'Cambio posterior al cierre.' });
  assert.equal(e.status, 409);
  assert.equal((await admin.put(`/auditorias/${audId}`, AUD)).status, 409);
});

test('Integridad en BD: restricciones CHECK impiden datos inválidos aunque se salte la API', () => {
  const db = getDb();
  assert.throws(() => db.prepare("UPDATE evaluacion_control SET estado='NO_APLICABLE', justificacion_na=NULL WHERE id_evaluacion=?").run(evals['8.31']), /CHECK/);
  assert.throws(() => db.prepare("UPDATE auditoria SET fecha_fin='2000-01-01' WHERE id_auditoria=?").run(audId), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO hallazgo (id_evaluacion,id_auditoria,codigo,condicion,criterio,causa,efecto_riesgo,severidad) VALUES (?,?,?,?,?,?,?,?)")
    .run(999999, audId, 'H-99', 'x'.repeat(20), 'x'.repeat(20), 'xxxxxx', 'x'.repeat(20), 'ALTA'), /FOREIGN KEY/);
});
