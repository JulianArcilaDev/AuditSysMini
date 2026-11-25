# Despliegue en Render con Docker · AuditSys Mini

Arquitectura en producción:

| Local (`docker-compose.yml`) | Producción (Render) | Conexión |
|---|---|---|
| `app` (`build: .`) | **Web Service**, Language **Docker** | URL pública `https://…onrender.com` |
| `db` (`postgres:16-alpine`) | **Render PostgreSQL 16**, plan Free | Red interna (mismo workspace y región, sin SSL) |
| `environment:` | Pestaña **Environment** del Web Service | Render inyecta las variables al contenedor |

> La aplicación espera a PostgreSQL al arrancar (10 intentos) y no abre el puerto si no logra conectarse. Por eso primero se crea la base y después el Web Service.

## 1. Iniciar sesión en Render con GitHub

1. Entra a <https://dashboard.render.com> y elige **GitHub** como método de ingreso.
2. Autoriza a Render. Si es la primera vez, crea un workspace con tu nombre.

## 2. Crear la base PostgreSQL

**+ New → Postgres**

| Campo | Valor |
|---|---|
| Name | `auditsys-db` |
| Database | `auditsys` |
| User | `auditsys` |
| Region | Anótala (p. ej. *Virginia (US East)*). El Web Service debe ir en la **misma** |
| PostgreSQL Version | `16` |
| Plan | **Free** |

**Create Database** y espera el estado **Available**. En **Connect → Internal** copia la **Internal Database URL** (`postgresql://auditsys:…@dpg-xxxx-a/auditsys`).

> Usa la URL **interna**. La externa exige SSL; si la usas, agrega también `PGSSL=true`.

## 3. Crear el Web Service

**+ New → Web Service → Git Provider →** `JulianArcilaDev/AuditSysMini` **→ Connect.** Si el repositorio no aparece, usa *Configure account* y dale acceso a Render.

| Campo | Valor |
|---|---|
| Name | `auditsys-mini` (define la URL `auditsys-mini.onrender.com`) |
| Language | **Docker** |
| Branch | `main` |
| Region | La misma de la base |
| Root Directory | (vacío) |
| Instance Type | **Free** |

**Advanced:**

| Campo | Valor |
|---|---|
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context Directory | `.` |
| Health Check Path | `/health` |
| Auto-Deploy | On Commit |

## 4. Variables de entorno

| Key | Value | Nota |
|---|---|---|
| `PORT` | `3000` | Coincide con `EXPOSE 3000` |
| `DATABASE_URL` | *Internal Database URL* del paso 2 | También sirven `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` por separado |
| `AUDITSYS_SECRET` | botón **Generate** | Clave de firma de sesiones |
| `TRUST_PROXY` | `1` | Render pone un proxy delante; así el límite de intentos de login usa la IP real |
| `ADMIN_PASSWORD` | una contraseña propia | Reemplaza `Admin2026*` en la URL pública |
| `AUDITOR_PASSWORD` | una contraseña propia | Reemplaza `Auditor2026*` para Ana y Carlos |

`NODE_ENV=production` y `HOST=0.0.0.0` ya vienen en el `Dockerfile`. Con `NODE_ENV=production` la cookie de sesión lleva `Secure` (Render sirve HTTPS).

**Deploy Web Service.** El primer build tarda 2–5 minutos.

## 5. Verificar

Logs esperados:

```
==> Building with Dockerfile
#… [deps 4/4] RUN npm ci --omit=dev
==> Deploying...
Conectando a PostgreSQL en DATABASE_URL
PostgreSQL connected · esquema verificado
Carga inicial: catálogo de 93 controles, usuarios de prueba y auditoría simulada de Empresa ABC.
AuditSys Mini escuchando en http://localhost:3000
==> Your service is live 🎉
```

```bash
API=https://auditsys-mini.onrender.com
curl $API/health        # {"status":"ok","service":"auditsys-mini","version":"1.1.0"}
curl $API/api/health    # {"status":"ok","database":"postgresql",...}
```

Luego abre la URL en el navegador e inicia sesión.

> En el plan Free el servicio se duerme tras 15 minutos sin tráfico; la primera petición tarda unos 50 segundos.

## 6. Despliegue continuo

Cada push a `main` dispara un deploy (pestaña **Events**). Si el build falla, sigue en línea la versión anterior; cualquier deploy exitoso tiene el botón **Rollback**.

```bash
git switch -c feature/mi-cambio
# … cambios …
git add .
git commit -m "feat: describe el cambio"
git push -u origin feature/mi-cambio
# Abrir el Pull Request en GitHub y hacer merge a main → Render despliega
```

## 7. Errores comunes

| Mensaje en el log | Causa | Solución |
|---|---|---|
| `Esperando a PostgreSQL (ECONNREFUSED)` y luego `Failed to start server` | Falta `DATABASE_URL`; la app intenta `localhost` | Agrega la variable (paso 4) |
| `getaddrinfo ENOTFOUND dpg-…-a` | Base y Web Service en regiones distintas, o URL mal copiada | Misma región; copia de nuevo la URL interna |
| `password authentication failed` | Usuario o contraseña incorrectos | Copia de nuevo la URL desde *Connect* |
| `SSL/TLS required` / `no pg_hba.conf entry` | Usaste la URL externa | Usa la interna, o agrega `PGSSL=true` |
| `No open ports detected` | La app terminó antes de abrir el puerto | Busca el error real más arriba en el log |

## 8. Límites del plan Free

- Una base PostgreSQL gratuita por workspace, que **vence a los 30 días**. Después se crea una nueva y se actualiza `DATABASE_URL`; el catálogo y la auditoría de ejemplo se cargan solos.
- Nunca subas tu `.env` real: está en `.gitignore` y `.dockerignore`. Las credenciales de producción solo viven en Render.
