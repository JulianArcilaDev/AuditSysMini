// Carga inicial: catálogo ISO/IEC 27002:2022 (93 controles), usuarios de prueba y
// auditoría simulada de "Empresa ABC" (datos ficticios, ver documento de ejemplo del curso).
//   npm run seed        → crea catálogo y usuarios si no existen (requiere PostgreSQL)
//   npm run seed:demo   → (re)crea la auditoría de ejemplo de Empresa ABC
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, closeDb, query, one, tx } from './db.js';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Preguntas orientadoras del ejemplo del curso (redactadas con fines académicos)
const PREGUNTAS = {
  '5.1': '¿Existe una política aprobada por la dirección, comunicada y revisada en intervalos planificados?',
  '5.15': '¿Hay reglas de acceso basadas en requisitos del negocio y de seguridad?',
  '5.18': '¿Se aprueban, revisan y retiran los derechos de acceso mediante un procedimiento?',
  '5.24': '¿Hay procesos, roles y responsabilidades definidos para gestionar incidentes?',
  '6.3': '¿El personal recibe formación periódica y pertinente en seguridad de la información?',
  '7.2': '¿Las áreas seguras tienen controles de entrada y registro de accesos?',
  '8.5': '¿La autenticación es acorde con el riesgo (por ejemplo, múltiple factor en accesos privilegiados)?',
  '8.7': '¿Existe protección contra malware actualizada en equipos y servidores?',
  '8.8': '¿Se identifican, evalúan y tratan periódicamente las vulnerabilidades técnicas?',
  '8.13': '¿Las copias se realizan según una política y se prueba su restauración?',
  '8.15': '¿Se generan, protegen y revisan los registros de actividad?',
  '8.23': '¿Se gestiona el acceso a sitios web externos para reducir la exposición a contenido malicioso?',
  '8.31': '¿Los entornos de desarrollo, prueba y producción están separados y protegidos?',
};

// Usuarios de prueba (solo para entorno académico/local; cambie las contraseñas en producción)
// Usuarios de prueba. En un despliegue público cambie las contraseñas con las variables
// ADMIN_PASSWORD y AUDITOR_PASSWORD (solo se aplican al crear los usuarios por primera vez).
export const USUARIOS_DEMO = [
  { nombre: 'Administrador AuditSys', correo: 'admin@auditsys.local', password: process.env.ADMIN_PASSWORD || 'Admin2026*', rol: 'admin' },
  { nombre: 'Ana R. (Auditora líder)', correo: 'ana@auditsys.local', password: process.env.AUDITOR_PASSWORD || 'Auditor2026*', rol: 'auditor' },
  { nombre: 'Carlos M. (Auditor)', correo: 'carlos@auditsys.local', password: process.env.AUDITOR_PASSWORD || 'Auditor2026*', rol: 'auditor' },
];

export async function seedBase() {
  const catalogo = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'controles-iso27002.json'), 'utf8'));
  await tx(async () => {
    for (const c of catalogo)
      await query(`INSERT INTO control (codigo_iso, nombre, categoria, criterio, pregunta, ejemplo, evidencia_sugerida)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT (codigo_iso) DO NOTHING`,
      [c.codigo, c.nombre, c.categoria, c.descripcion, PREGUNTAS[c.codigo] ?? null, c.ejemplo ?? null, c.evidencia_sugerida ?? null]);
    for (const u of USUARIOS_DEMO)
      await query('INSERT INTO usuario (nombre, correo, password_hash, rol) VALUES (?,?,?,?) ON CONFLICT (correo) DO NOTHING',
        [u.nombre, u.correo, hashPassword(u.password), u.rol]);
  });
}

// --- Auditoría simulada: Empresa ABC ---
const EVALS = [
  ['5.1', 'IMPLEMENTADO', 'Política vigente, aprobada por la gerencia y revisada en 2026.', null,
    [['Política de seguridad de la información v2.0 aprobada por gerencia', 'Documental', 'Gerencia general', 'DOC-SGSI-001 v2.0']]],
  ['5.15', 'IMPLEMENTADO', 'Matriz de roles y permisos aprobada; accesos asignados por perfil.', null,
    [['Matriz de roles y permisos de aplicaciones empresariales', 'Documental', 'Líder de TI', 'MAT-ACC-2026']]],
  ['5.18', 'PARCIAL', 'Altas y bajas gestionadas; la revisión de accesos no es periódica.', null,
    [['Entrevista al líder de TI sobre gestión de derechos de acceso', 'Entrevista', 'Líder de TI', 'ACTA-ENT-03']]],
  ['5.24', 'NO_IMPLEMENTADO', 'No hay procedimiento ni roles definidos para la gestión de incidentes.', null,
    [['Acta de entrevista: ausencia de procedimiento de incidentes', 'Entrevista', 'Coordinador de soporte', 'ACTA-ENT-04']]],
  ['6.3', 'PARCIAL', 'Inducción inicial sin refuerzo anual ni evaluación de la formación.', null,
    [['Lista de asistencia a la inducción de seguridad 2026', 'Documental', 'Talento humano', 'TH-IND-2026-02']]],
  ['7.2', 'IMPLEMENTADO', 'Acceso al cuarto de servidores con tarjeta de proximidad y bitácora de visitantes.', null,
    [['Registro fotográfico del control de acceso y bitácora del cuarto de servidores', 'Fotográfica', 'Observación en sitio', 'FOTO-CS-01; BIT-CS-NOV2026']]],
  ['8.5', 'PARCIAL', 'Autenticación multifactor habilitada solo en cuentas administrativas.', null,
    [['Captura de la configuración de MFA en el directorio', 'Técnica', 'Administrador de plataforma', 'CAP-MFA-01']]],
  ['8.7', 'IMPLEMENTADO', 'Antimalware centralizado y actualizado en toda la muestra revisada (20 equipos, 4 servidores).', null,
    [['Consola de antimalware con estado de firmas y agentes', 'Técnica', 'Mesa de servicio', 'CAP-AV-CONSOLA']]],
  ['8.8', 'NO_IMPLEMENTADO', 'No se realizan escaneos periódicos de vulnerabilidades; no existen reportes.', null,
    [['Acta de entrevista: no existen reportes de escaneo', 'Entrevista', 'Líder de infraestructura', 'ACTA-ENT-09']]],
  ['8.13', 'PARCIAL', 'Respaldos diarios automatizados; sin pruebas de restauración documentadas.', null,
    [['Bitácora de respaldos de octubre y noviembre de 2026', 'Documental', 'Administrador de backups', 'BIT-BKP-2026']]],
  ['8.15', 'NO_IMPLEMENTADO', 'Registros locales en cada servidor, sin centralización ni revisión periódica.', null,
    [['Captura de la configuración de registros en servidores', 'Técnica', 'Administrador de servidores', 'CAP-LOG-01']]],
  ['8.23', 'PARCIAL', 'Filtrado web operativo solo en la sede principal; sedes remotas sin proxy.', null,
    [['Configuración del proxy de navegación de la sede principal', 'Técnica', 'Administrador de red', 'CAP-PROXY-01']]],
  ['8.31', 'NO_APLICABLE', 'Control evaluado como no aplicable al alcance.',
    'La empresa adquiere soluciones como servicio (SaaS) y no desarrolla software propio; no mantiene entornos de desarrollo ni pruebas.', []],
];

const HALLAZGOS = [
  ['8.8', 'ALTA', 'No se evidencian escaneos ni reportes periódicos de vulnerabilidades en los servidores expuestos.',
    'ISO/IEC 27002:2022, control 8.8: obtener información sobre vulnerabilidades técnicas, evaluar la exposición y tomar medidas apropiadas.',
    'No hay responsable asignado ni procedimiento de gestión de parches y vulnerabilidades.',
    'Mayor probabilidad de explotación de vulnerabilidades conocidas, con impacto en la disponibilidad y confidencialidad de los datos de clientes.',
    ['Designar responsable, definir el procedimiento y ejecutar escaneos mensuales con plazos de remediación según la criticidad.', 'ALTA', 60, 'Líder de infraestructura']],
  ['5.24', 'ALTA', 'No existe procedimiento documentado ni roles definidos para gestionar incidentes de seguridad; los eventos se atienden de manera informal.',
    'ISO/IEC 27002:2022, control 5.24: definir procesos, roles y responsabilidades para la gestión de incidentes.',
    'Falta de definición de responsabilidades y de un canal único de reporte.',
    'Respuesta tardía o inconsistente, pérdida de evidencia y posible incumplimiento de obligaciones de notificación.',
    ['Formalizar el procedimiento, designar el equipo de respuesta, habilitar un canal de reporte y realizar un simulacro semestral.', 'ALTA', 60, 'Oficial de seguridad']],
  ['8.13', 'MEDIA', 'Se ejecutan respaldos diarios, pero no hay pruebas de restauración registradas.',
    'ISO/IEC 27002:2022, control 8.13: mantener y probar periódicamente las copias de seguridad.',
    'No existe procedimiento ni responsable de las pruebas de restauración.',
    'Imposibilidad de recuperar información crítica de clientes ante una falla o un ataque de ransomware.',
    ['Definir el procedimiento de respaldo y ejecutar pruebas de restauración trimestrales documentadas.', 'MEDIA', 90, 'Administrador de backups']],
  ['8.15', 'MEDIA', 'Los registros se almacenan localmente en cada servidor, sin centralización ni revisión periódica.',
    'ISO/IEC 27002:2022, control 8.15: producir, proteger y analizar los registros de actividad.',
    'No se ha implementado una solución de gestión de registros.',
    'Dificultad para detectar y reconstruir incidentes, y posibilidad de alteración de los registros.',
    ['Centralizar los registros críticos, proteger su integridad y definir una revisión periódica.', 'MEDIA', 120, 'Administrador de servidores']],
];

export async function seedDemo() {
  const ana = await one("SELECT id_usuario FROM usuario WHERE correo = 'ana@auditsys.local'");
  if (!ana) throw new Error('Ejecute primero la carga base.');
  return tx(async () => {
    await query("DELETE FROM auditoria WHERE organizacion = 'Empresa ABC (ficticia)'");
    const { id_auditoria: idA } = await one(`INSERT INTO auditoria (organizacion, objetivo, alcance, referentes, fecha_inicio, fecha_fin, estado, id_auditor)
      VALUES (?,?,?,?,?,?,?,?) RETURNING id_auditoria`, [
      'Empresa ABC (ficticia)',
      'Evaluar el estado de implementación de 13 controles seleccionados de ISO/IEC 27002:2022 en los servicios de TI de la organización.',
      'Servidores, estaciones de trabajo, aplicaciones empresariales, bases de datos de clientes, red corporativa y usuarios internos y externos.',
      'ISO 19011:2018 (principios de auditoría); ISO/IEC 27001:2022; ISO/IEC 27002:2022',
      '2026-11-09', '2026-11-20', 'EN_REVISION', ana.id_usuario]);
    const evalIds = {};
    let nEv = 0;
    for (const [i, [cod, estado, obs, just, evs]] of EVALS.entries()) {
      const e = await one(`INSERT INTO evaluacion_control (id_auditoria, id_control, estado, observacion, justificacion_na, evaluado_en)
        SELECT ?, id_control, ?, ?, ?, now() FROM control WHERE codigo_iso = ? RETURNING id_evaluacion`, [idA, estado, obs, just, cod]);
      evalIds[cod] = e.id_evaluacion;
      for (const [desc, tipo, fuente, ref] of evs) {
        nEv++;
        const dia = String(10 + (i % 8)).padStart(2, '0');
        await query('INSERT INTO evidencia (id_evaluacion, codigo, descripcion, tipo, fuente, fecha, referencia, es_simulada) VALUES (?,?,?,?,?,?,?,1)',
          [evalIds[cod], `EV-${String(nEv).padStart(2, '0')}`, `${desc} (simulada)`, tipo, fuente, `2026-11-${dia}`, ref]);
      }
    }
    for (const [i, [cod, sev, cond, crit, causa, efecto, rec]] of HALLAZGOS.entries()) {
      const n = String(i + 1).padStart(2, '0');
      const h = await one(`INSERT INTO hallazgo (id_evaluacion, id_auditoria, codigo, condicion, criterio, causa, efecto_riesgo, severidad)
        VALUES (?,?,?,?,?,?,?,?) RETURNING id_hallazgo`, [evalIds[cod], idA, `H-${n}`, cond, crit, causa, efecto, sev]);
      await query('INSERT INTO recomendacion (id_hallazgo, codigo, descripcion, prioridad, plazo_dias, responsable) VALUES (?,?,?,?,?,?)',
        [h.id_hallazgo, `R-${n}`, ...rec]);
    }
    return idA;
  });
}

export async function seedIfEmpty() {
  const { n } = await one('SELECT COUNT(*) AS n FROM control');
  await seedBase();
  if (n === 0 && process.env.AUDITSYS_NO_DEMO !== '1') {
    await seedDemo();
    console.log('Carga inicial: catálogo de 93 controles, usuarios de prueba y auditoría simulada de Empresa ABC.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  (async () => {
    await initDb();
    await seedBase();
    console.log('Catálogo (93 controles) y usuarios de prueba cargados.');
    if (process.argv.includes('--demo')) console.log(`Auditoría simulada de Empresa ABC creada (id ${await seedDemo()}).`);
    await closeDb();
  })().catch(async (e) => { console.error(e.message); await closeDb(); process.exit(1); });
}
