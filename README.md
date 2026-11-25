# AuditSys Mini

Sistema de Gestión de Auditorías de Sistemas de Información — proyecto académico (Ingeniería de Sistemas, 9.º semestre).

Aplicación web que permite configurar una auditoría de seguridad de la información, seleccionar entre 10 y 15 controles de **ISO/IEC 27002:2022**, evaluarlos, registrar evidencias, documentar hallazgos con sus recomendaciones, calcular indicadores y generar un informe consolidado, manteniendo trazabilidad entre todos los elementos.

> La herramienta **no certifica** organizaciones ni determina por sí sola el cumplimiento normativo. Los indicadores son descriptivos y los criterios los define y valida el auditor.

---

**Producción:** <https://URL-DE-RENDER.onrender.com> · **Repositorio:** <https://github.com/JulianArcilaDev/AuditSysMini>

## 1. Ejecución

### Opción A · Docker Compose (recomendada)

Requisito: Docker Desktop en ejecución.

```bash
docker compose up --build -d     # o: npm run docker:up
```

Abrir <http://localhost:3000>. Compose levanta dos servicios en la misma red:

| Servicio | Imagen | Puerto en tu PC | Detalle |
|---|---|---|---|
| `db` | `postgres:16-alpine` | `5433` | Volumen `pgdata` para conservar los datos; healthcheck con `pg_isready` |
| `app` | construida con el `Dockerfile` | `3000` | Se conecta a la base por el nombre del servicio (`POSTGRES_HOST=db`), no por `localhost`; arranca cuando `db` está *healthy* |

| Comando | Uso |
|---|---|
| `npm run docker:up` | `docker compose up --build -d` |
| `npm run docker:logs` | `docker compose logs -f app` |
| `npm run docker:down` | `docker compose down` (los datos se conservan) |
| `docker compose down -v` | Detiene y **borra** los datos |

Pruebas de humo:

```bash
curl http://localhost:3000/health        # {"status":"ok","service":"auditsys-mini",...}
curl http://localhost:3000/api/health    # {"status":"ok","database":"postgresql",...}
```

### Opción B · Node.js local + PostgreSQL en Docker

Requisitos: Node.js 22.9 o superior.

```bash
cp .env.example .env
npm install
npm run db:up        # solo el contenedor de PostgreSQL (localhost:5433)
npm run dev
```

### Pruebas automatizadas

```bash
npm run db:up
npm test             # CP-01 a CP-13 contra una base aparte (auditsys_test)
```

En el primer arranque la aplicación crea las tablas y carga:

- el catálogo completo de 93 controles de ISO/IEC 27002:2022 (criterio, ejemplo de aplicación y evidencia sugerida),
- los usuarios de prueba,
- la auditoría simulada de **Empresa ABC (ficticia)** con 13 controles, 12 evidencias, 4 hallazgos y 4 recomendaciones (estado *En revisión*, lista para cerrar en la sustentación).

`npm run seed:demo` vuelve a crear la auditoría de ejemplo. Las variables de entorno están documentadas en [.env.example](.env.example).

### Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@auditsys.local` | `Admin2026*` |
| Auditora líder (responsable de Empresa ABC) | `ana@auditsys.local` | `Auditor2026*` |
| Auditor | `carlos@auditsys.local` | `Auditor2026*` |

En el despliegue público las contraseñas iniciales se reemplazan con las variables `ADMIN_PASSWORD` y `AUDITOR_PASSWORD`.

---

## 2. Stack y justificación

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | HTML5, CSS3 y JavaScript (módulos ES) sin framework | Sin paso de compilación; cada pantalla es un módulo pequeño y fácil de explicar en la sustentación. |
| Backend | Node.js + Express | API REST sencilla, validación en servidor y control de acceso. |
| Base de datos | PostgreSQL 16 (driver `pg`) | Persistencia real con llaves foráneas, `CHECK`, `JSONB` y transacciones. En producción es una base administrada de Render. |
| Contenedores | Docker (multi-stage) + Docker Compose | La misma imagen corre en el PC y en Render. |
| Despliegue | Render (Web Service Docker + PostgreSQL) | Despliegue continuo: cada push a `main` publica una versión nueva. |

Arquitectura de tres capas, monolito modular (el documento orientador pide una arquitectura sencilla y desplegable, sin microservicios):

```
Navegador (SPA)  ──HTTP/JSON──▶  Express (rutas → servicios)  ──SQL──▶  PostgreSQL
public/js/views/*                 server/routes/*                       server/schema.sql
                                  server/services/auditoria.js
```

### Estructura

```
server/
  index.js            arranque: espera a PostgreSQL, crea el esquema y carga datos iniciales
  app.js              Express: cabeceras de seguridad, rutas, manejo de errores
  db.js               pool de PostgreSQL, transacciones, bitácora, códigos secuenciales
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
docs/                 modelo de datos, casos de uso, informe de pruebas y guía de despliegue
Dockerfile            imagen multi-stage (deps → runtime), usuario no root, healthcheck
docker-compose.yml    app + PostgreSQL para desarrollo local
.dockerignore         excluye node_modules, .git, .env, datos y pruebas de la imagen
.env.example          variables de entorno
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
| RNF02 | Persistencia | PostgreSQL (volumen `pgdata` en local; base administrada en Render). Los archivos de evidencia también se guardan en la BD |
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
- Archivos de evidencia limitados a 5 MB y a extensiones permitidas; se guardan en la BD (`BYTEA`) y se descargan como adjunto.
- El contenedor se ejecuta con el usuario sin privilegios `node`; las credenciales viven en variables de entorno, nunca en el repositorio.
- Bitácora (`bitacora`) de inicios de sesión, cambios de estado y operaciones de creación, actualización y eliminación.

---

## 6. Despliegue en Render

La aplicación se publica como **Web Service (Docker)** conectado a una **base PostgreSQL de Render**, ambos en el plan Free y en la misma región. Paso a paso: [docs/despliegue-render.md](docs/despliegue-render.md).

| Pieza local (`docker-compose.yml`) | En Render |
|---|---|
| `app` (`build: .`) | Web Service · Language **Docker** · Health Check Path `/health` |
| `db` (`postgres:16-alpine`) | Render PostgreSQL 16 (Free) |
| Variables en `environment` | Pestaña **Environment** del Web Service |

Con **Auto-Deploy: On Commit**, cada `git push` a `main` construye la imagen y la publica sin caída; si el build falla, sigue en línea la versión anterior.

## 7. Pruebas

`npm test` ejecuta 16 pruebas automatizadas (CP-01 a CP-13 del plan, autenticación, integridad de la BD y salud del servicio) contra una base PostgreSQL de prueba. Resultados y casos manuales: [docs/informe-pruebas.md](docs/informe-pruebas.md).

## 8. Referentes

ISO 19011:2018 · ISO/IEC 27001:2022 · ISO/IEC 27002:2022 · ISO 31000:2018 (complementario) · ISO/IEC 25010:2023. Todos los datos de Empresa ABC son ficticios y se usan solo con fines académicos.
