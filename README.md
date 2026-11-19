# AuditSys Mini

Sistema de Gestión de Auditorías de Sistemas de Información — proyecto académico (Ingeniería de Sistemas, 9.º semestre).

Aplicación web que permite configurar una auditoría de seguridad de la información, seleccionar entre 10 y 15 controles de **ISO/IEC 27002:2022**, evaluarlos, registrar evidencias, documentar hallazgos con sus recomendaciones, calcular indicadores y generar un informe consolidado, manteniendo trazabilidad entre todos los elementos.

> La herramienta **no certifica** organizaciones ni determina por sí sola el cumplimiento normativo. Los indicadores son descriptivos y los criterios los define y valida el auditor.

---

## 1. Ejecución

Requisitos: **Node.js 22.13 o superior** (usa el módulo SQLite integrado `node:sqlite`; no requiere instalar un motor de base de datos).

```bash
npm install
npm start
```

Abrir <http://localhost:3000>. En el primer arranque se crea `data/auditsys.db` con:

- el catálogo completo de 93 controles de ISO/IEC 27002:2022 (criterio, ejemplo de aplicación y evidencia sugerida),
- los usuarios de prueba,
- la auditoría simulada de **Empresa ABC (ficticia)** con 13 controles, 12 evidencias, 4 hallazgos y 4 recomendaciones (estado *En revisión*, lista para cerrar en la sustentación).

| Comando | Uso |
|---|---|
| `npm start` | Inicia el servidor (puerto `PORT`, por defecto 3000) |
| `npm run dev` | Inicia con recarga automática |
| `npm test` | Ejecuta las pruebas automatizadas CP-01 a CP-13 (BD temporal) |
| `npm run seed:demo` | Vuelve a crear la auditoría de ejemplo de Empresa ABC |

Variables opcionales: `PORT`, `HOST`, `AUDITSYS_DATA_DIR` (carpeta de datos), `AUDITSYS_SECRET` (clave de firma de sesiones), `AUDITSYS_NO_DEMO=1` (no cargar la auditoría de ejemplo en una BD nueva). Para empezar desde cero basta con borrar la carpeta `data/`.

### Usuarios de prueba (solo entorno académico/local)

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@auditsys.local` | `Admin2026*` |
| Auditora líder (responsable de Empresa ABC) | `ana@auditsys.local` | `Auditor2026*` |
| Auditor | `carlos@auditsys.local` | `Auditor2026*` |

---

## 2. Stack y justificación

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | HTML5, CSS3 y JavaScript (módulos ES) sin framework | Sin paso de compilación; cada pantalla es un módulo pequeño y fácil de explicar en la sustentación. |
| Backend | Node.js + Express | API REST sencilla, validación en servidor y control de acceso. |
| Base de datos | SQLite (`node:sqlite`) | Persistencia real con llaves foráneas y restricciones `CHECK`, sin instalar servidores. El esquema es portable a PostgreSQL/MySQL. |

Arquitectura de tres capas, monolito modular (el documento orientador pide una arquitectura sencilla y desplegable, sin microservicios):

```
Navegador (SPA)  ──HTTP/JSON──▶  Express (rutas → servicios)  ──SQL──▶  SQLite
public/js/views/*                 server/routes/*                       server/schema.sql
                                  server/services/auditoria.js
```

### Estructura

```
server/
  index.js            arranque
  app.js              Express: cabeceras de seguridad, rutas, manejo de errores
  db.js               conexión, transacciones, bitácora, códigos secuenciales
  schema.sql          modelo relacional con restricciones
  auth.js             contraseñas (scrypt), sesión firmada (HMAC), roles
  validators.js       validación en servidor
  seed.js             catálogo, usuarios y auditoría de ejemplo
  services/auditoria.js   indicadores (RF07), reglas de transición, consolidado del informe
  routes/             auth, controles, auditorias, evaluaciones, hallazgos, informes, dashboard
  data/controles-iso27002.json   catálogo (93 controles) extraído de los documentos del curso
public/
  index.html, css/styles.css
  js/app.js (enrutador), api.js, ui.js
  js/views/           una vista por pantalla
tests/api.test.js     casos CP-01 a CP-13
docs/                 modelo de datos, casos de uso e informe de pruebas
```

---

## 3. Requisitos cubiertos

| Código | Requisito | Dónde |
|---|---|---|
| RF01 | Registrar auditoría (organización, objetivo, alcance, fechas, responsable) | Auditorías → Nueva auditoría |
| RF02 | Gestionar controles (consultar 10–15 seleccionados con su criterio) | Catálogo de controles; paso *Controles* de cada auditoría |
| RF03 | Evaluar controles (4 estados + observaciones) | Paso *Evaluación* |
| RF04 | Registrar evidencias (descripción, fuente, fecha, archivo o referencia) | Paso *Evaluación* → Registrar evidencia |
| RF05 | Documentar hallazgos (condición, criterio, causa, efecto, severidad) | Paso *Hallazgos* |
| RF06 | Asociar recomendaciones a hallazgos | Paso *Hallazgos* |
| RF07 | Calcular resultados con fórmula explícita, excluyendo N/A del denominador | Resumen, Dashboard e Informe |
| RF08 | Generar informe | Paso *Informe* (versionado, imprimible / PDF) |
| RF09 | Dashboard de indicadores de gestión | Dashboard |
| RNF01 | Usabilidad y adaptabilidad | Diseño responsivo (menú plegable, una columna, botones ≥ 44 px) |
| RNF02 | Persistencia | SQLite en `data/auditsys.db` |
| RNF03 | Validación | En cliente (mensajes junto al campo) y en servidor; restricciones `CHECK` en BD |
| RNF04 | Seguridad básica | Ver sección 5 |
| RNF05 | Trazabilidad | Llaves foráneas + paso *Trazabilidad* con alertas de vacíos |
| RNF06 | Mantenibilidad | Código modular, este README y pruebas automatizadas |

### Flujo y reglas de negocio

Ciclo de vida: **Borrador → En ejecución → En revisión → Cerrada**.

| Transición | Regla verificada por el servidor |
|---|---|
| → En ejecución | Entre 10 y 15 controles seleccionados |
| → En revisión | Todos los controles evaluados; *Implementado* y *Parcial* con al menos una evidencia |
| → Cerrada | Al menos 3 hallazgos y cada hallazgo con al menos una recomendación |
| Cerrada | Solo lectura: no se permiten cambios en evaluaciones, evidencias ni hallazgos |

Otras reglas: *No aplicable* exige justificación; la observación es obligatoria; los códigos `EV-nn`, `H-nn` y `R-nn` se generan automáticamente por auditoría; el criterio del hallazgo se prellena desde el catálogo; las evidencias se marcan como simuladas por defecto.

---

## 4. Indicadores (RF07)

```
Aplicables          = Total evaluados − No aplicables
Cumplimiento base   = Implementados ÷ Aplicables × 100
Índice ponderado    = (Implementados + 0,5 × Parciales) ÷ Aplicables × 100
Avance              = Evaluados ÷ Seleccionados × 100
```

Ejemplo de Empresa ABC: 4 implementados, 5 parciales, 3 no implementados y 1 no aplicable → 12 aplicables → **33,3 %** base y **54,2 %** ponderado.

**Limitaciones:** el indicador es descriptivo, depende de los estados registrados por el auditor, no equivale a una certificación y el peso 0,5 de los parciales es una convención académica.

---

## 5. Seguridad (RNF04)

- Contraseñas con **scrypt** y sal aleatoria; nunca se guardan en texto plano.
- Sesión mediante token firmado con **HMAC-SHA256** en cookie `HttpOnly`, `SameSite=Strict` (y `Secure` con `NODE_ENV=production`), con vencimiento de 8 horas.
- Límite de 5 intentos de inicio de sesión por IP cada 5 minutos.
- **Roles**: `auditor` gestiona solo sus auditorías y consulta el catálogo; `admin` además administra el catálogo y los usuarios, y puede asignar responsables.
- Solo el auditor responsable o un administrador modifica una auditoría; una auditoría cerrada es de solo lectura.
- Consultas parametrizadas (sin concatenar SQL), escape de HTML en todas las vistas, Content-Security-Policy sin scripts en línea, `X-Frame-Options`, `nosniff`.
- Archivos de evidencia limitados a 5 MB y a extensiones permitidas; se guardan con nombre aleatorio y se descargan como adjunto.
- Bitácora (`bitacora`) de inicios de sesión, cambios de estado y operaciones de creación, actualización y eliminación.

---

## 6. Pruebas

`npm test` ejecuta 15 pruebas automatizadas (CP-01 a CP-13 del plan, autenticación e integridad de la BD) contra una base de datos temporal. Resultados y casos manuales: [docs/informe-pruebas.md](docs/informe-pruebas.md).

## 7. Referentes

ISO 19011:2018 · ISO/IEC 27001:2022 · ISO/IEC 27002:2022 · ISO 31000:2018 (complementario) · ISO/IEC 25010:2023. Todos los datos de Empresa ABC son ficticios y se usan solo con fines académicos.
