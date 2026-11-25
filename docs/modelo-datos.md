# Modelado de la solución

## 1. Modelo entidad-relación

```mermaid
erDiagram
  USUARIO ||--o{ AUDITORIA : "es responsable de"
  AUDITORIA ||--o{ EVALUACION_CONTROL : "evalúa"
  CONTROL ||--o{ EVALUACION_CONTROL : "se evalúa en"
  EVALUACION_CONTROL ||--o{ EVIDENCIA : "se sustenta con"
  EVALUACION_CONTROL ||--o{ HALLAZGO : "origina"
  HALLAZGO ||--o{ RECOMENDACION : "tiene"
  AUDITORIA ||--o{ INFORME : "genera"
  USUARIO ||--o{ INFORME : "genera"
  USUARIO ||--o{ BITACORA : "registra"

  USUARIO { int id_usuario PK
    text correo UK
    text password_hash
    text rol "auditor | admin" }
  CONTROL { int id_control PK
    text codigo_iso UK
    text nombre
    text categoria
    text criterio
    text pregunta
    text evidencia_sugerida }
  AUDITORIA { int id_auditoria PK
    text organizacion
    text objetivo
    text alcance
    date fecha_inicio
    date fecha_fin "≥ fecha_inicio"
    text estado "BORRADOR..CERRADA"
    int id_auditor FK }
  EVALUACION_CONTROL { int id_evaluacion PK
    int id_auditoria FK
    int id_control FK
    text estado
    text observacion
    text justificacion_na }
  EVIDENCIA { int id_evidencia PK
    int id_evaluacion FK
    text codigo "EV-nn"
    text descripcion
    text tipo
    text fuente
    date fecha
    text referencia
    bytea archivo_datos
    int es_simulada }
  HALLAZGO { int id_hallazgo PK
    int id_evaluacion FK
    text codigo "H-nn"
    text condicion
    text criterio
    text causa
    text efecto_riesgo
    text severidad }
  RECOMENDACION { int id_recomendacion PK
    int id_hallazgo FK
    text codigo "R-nn"
    text descripcion
    text prioridad
    int plazo_dias }
  INFORME { int id_informe PK
    int id_auditoria FK
    int version
    real cumplimiento_base
    real indice_ponderado
    text contenido "instantánea JSON" }
```

### Reglas de integridad en la base de datos (`server/schema.sql`, PostgreSQL 16)

| Entidad | Restricciones |
|---|---|
| usuario | correo único; `rol IN ('auditor','admin')` |
| control | `codigo_iso` único; criterio obligatorio; categoría dentro de las 4 de la norma |
| auditoria | `fecha_fin >= fecha_inicio`; estado dentro del ciclo de vida; FK a usuario |
| evaluacion_control | par (auditoría, control) único; observación obligatoria si está evaluado; `NO_APLICABLE` exige justificación |
| evidencia | siempre ligada a una evaluación; exige referencia o archivo; archivo ≤ 5 MB guardado en `BYTEA`; `es_simulada` por defecto 1 |
| hallazgo | condición, criterio, causa, efecto y severidad obligatorios; código único por auditoría |
| recomendacion | siempre ligada a un hallazgo; prioridad y plazo entre 1 y 730 días |
| informe | versión única por auditoría; guarda indicadores e instantánea en `JSONB` |

Las eliminaciones usan `ON DELETE CASCADE` para no dejar registros huérfanos (solo se pueden eliminar auditorías en borrador).

## 2. Casos de uso

```mermaid
flowchart LR
  A([Auditor]) --- CU1[CU01 Iniciar sesión]
  A --- CU2[CU02 Registrar auditoría]
  A --- CU3[CU03 Seleccionar controles]
  A --- CU4[CU04 Evaluar control]
  A --- CU5[CU05 Registrar evidencia]
  A --- CU6[CU06 Documentar hallazgo y recomendación]
  A --- CU7[CU07 Cambiar estado de la auditoría]
  A --- CU8[CU08 Consultar trazabilidad]
  A --- CU9[CU09 Generar informe]
  A --- CU10[CU10 Consultar dashboard]
  Ad([Administrador]) --- CU11[CU11 Administrar catálogo]
  Ad --- CU12[CU12 Administrar usuarios]
  Ad -. hereda .- A
```

| CU | Actor | Flujo principal | Requisitos |
|---|---|---|---|
| CU02 | Auditor | Diligencia organización, objetivo, alcance y fechas → el sistema valida y crea la auditoría en *Borrador* | RF01, RNF03 |
| CU03 | Auditor | Filtra el catálogo y activa entre 10 y 15 controles → guarda la selección | RF02 |
| CU04 | Auditor | Elige un control, lee su criterio, asigna estado y observación (justificación si es N/A) | RF03 |
| CU05 | Auditor | Registra descripción, tipo, fuente, fecha y referencia o archivo | RF04, RNF05 |
| CU06 | Auditor | Selecciona el control, completa condición, criterio, causa, efecto y severidad, y la recomendación con prioridad y plazo | RF05, RF06 |
| CU07 | Auditor | Solicita la transición; el sistema verifica las reglas y la aplica o lista lo pendiente | RNF04 |
| CU09 | Auditor | Elige secciones y genera una versión; imprime o guarda en PDF | RF08 |
| CU10 | Auditor/Admin | Consulta los indicadores globales o de una auditoría | RF07, RF09 |
| CU11 | Admin | Crea, edita o desactiva controles | RF02, RNF04 |

## 3. Componentes

```mermaid
flowchart TB
  subgraph Cliente [Navegador]
    R[app.js · enrutador hash] --> V[views/*.js · pantallas]
    V --> U[ui.js · plantillas, validación, gráficos]
    V --> API[api.js · fetch JSON]
  end
  subgraph Servidor [Node.js + Express]
    MW[auth.js · sesión y roles] --> RT[routes/*]
    RT --> VAL[validators.js]
    RT --> SV[services/auditoria.js · indicadores y reglas]
    RT --> DB[db.js]
  end
  API -- HTTP/JSON + cookie HttpOnly --> MW
  DB --> SQL[(PostgreSQL 16 · tablas + archivos de evidencia en BYTEA)]
```

## 4. Despliegue

```mermaid
flowchart LR
  Dev[git push a main] --> GH[GitHub · JulianArcilaDev/AuditSysMini]
  GH -- Auto-Deploy --> RW[Render Web Service · Docker]
  RW -- red interna --> RP[(Render PostgreSQL 16)]
  U([Usuario]) -- HTTPS --> RW
```
