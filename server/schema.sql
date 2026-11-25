-- AuditSys Mini · Modelo relacional (PostgreSQL 16)
-- Trazabilidad (RNF05): auditoria 1─N evaluacion_control 1─N evidencia / hallazgo 1─N recomendacion
-- Se ejecuta en cada arranque: todas las sentencias son idempotentes.

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario     SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL CHECK (length(trim(nombre)) >= 3),
  correo         TEXT NOT NULL CHECK (correo = lower(correo)),
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'auditor' CHECK (rol IN ('auditor','admin')),
  activo         SMALLINT NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_correo ON usuario (correo);

CREATE TABLE IF NOT EXISTS control (
  id_control          SERIAL PRIMARY KEY,
  codigo_iso          TEXT NOT NULL UNIQUE,
  nombre              TEXT NOT NULL,
  categoria           TEXT NOT NULL CHECK (categoria IN ('Organizacional','Personas','Físico','Tecnológico')),
  criterio            TEXT NOT NULL CHECK (length(trim(criterio)) > 0),
  pregunta            TEXT,
  ejemplo             TEXT,
  evidencia_sugerida  TEXT,
  fuente              TEXT NOT NULL DEFAULT 'ISO/IEC 27002:2022',
  activo              SMALLINT NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

CREATE TABLE IF NOT EXISTS auditoria (
  id_auditoria   SERIAL PRIMARY KEY,
  organizacion   TEXT NOT NULL CHECK (length(trim(organizacion)) >= 2),
  objetivo       TEXT NOT NULL CHECK (length(trim(objetivo)) >= 10),
  alcance        TEXT NOT NULL CHECK (length(trim(alcance)) >= 10),
  referentes     TEXT NOT NULL DEFAULT 'ISO 19011:2018; ISO/IEC 27001:2022; ISO/IEC 27002:2022',
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'BORRADOR'
                 CHECK (estado IN ('BORRADOR','EN_EJECUCION','EN_REVISION','CERRADA')),
  id_auditor     INTEGER NOT NULL REFERENCES usuario(id_usuario),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin >= fecha_inicio)
);

-- Una fila por control seleccionado en la auditoría. PENDIENTE = seleccionado, aún sin evaluar.
CREATE TABLE IF NOT EXISTS evaluacion_control (
  id_evaluacion     SERIAL PRIMARY KEY,
  id_auditoria      INTEGER NOT NULL REFERENCES auditoria(id_auditoria) ON DELETE CASCADE,
  id_control        INTEGER NOT NULL REFERENCES control(id_control),
  estado            TEXT NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','IMPLEMENTADO','PARCIAL','NO_IMPLEMENTADO','NO_APLICABLE')),
  observacion       TEXT,
  justificacion_na  TEXT,
  evaluado_en       TIMESTAMPTZ,
  UNIQUE (id_auditoria, id_control),
  CHECK (estado = 'PENDIENTE' OR length(trim(coalesce(observacion,''))) > 0),
  CHECK (estado <> 'NO_APLICABLE' OR length(trim(coalesce(justificacion_na,''))) > 0)
);

-- Los archivos de evidencia se guardan en la BD (BYTEA): el disco del contenedor es efímero.
CREATE TABLE IF NOT EXISTS evidencia (
  id_evidencia   SERIAL PRIMARY KEY,
  id_evaluacion  INTEGER NOT NULL REFERENCES evaluacion_control(id_evaluacion) ON DELETE CASCADE,
  codigo         TEXT NOT NULL,                              -- EV-01, EV-02 ... (único por auditoría)
  descripcion    TEXT NOT NULL CHECK (length(trim(descripcion)) >= 5),
  tipo           TEXT NOT NULL CHECK (tipo IN ('Documental','Entrevista','Observación','Técnica','Fotográfica')),
  fuente         TEXT NOT NULL CHECK (length(trim(fuente)) >= 2),
  fecha          DATE NOT NULL,
  referencia     TEXT,
  archivo_nombre TEXT,
  archivo_tipo   TEXT,
  archivo_datos  BYTEA,
  es_simulada    SMALLINT NOT NULL DEFAULT 1 CHECK (es_simulada IN (0,1)),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referencia IS NOT NULL OR archivo_datos IS NOT NULL),
  CHECK (archivo_datos IS NULL OR octet_length(archivo_datos) <= 5242880)
);

CREATE TABLE IF NOT EXISTS hallazgo (
  id_hallazgo    SERIAL PRIMARY KEY,
  id_evaluacion  INTEGER NOT NULL REFERENCES evaluacion_control(id_evaluacion) ON DELETE CASCADE,
  id_auditoria   INTEGER NOT NULL REFERENCES auditoria(id_auditoria) ON DELETE CASCADE,
  codigo         TEXT NOT NULL,                              -- H-01, H-02 ...
  condicion      TEXT NOT NULL CHECK (length(trim(condicion)) >= 10),
  criterio       TEXT NOT NULL CHECK (length(trim(criterio)) >= 10),
  causa          TEXT NOT NULL CHECK (length(trim(causa)) >= 5),
  efecto_riesgo  TEXT NOT NULL CHECK (length(trim(efecto_riesgo)) >= 10),
  severidad      TEXT NOT NULL CHECK (severidad IN ('ALTA','MEDIA','BAJA')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_auditoria, codigo)
);

CREATE TABLE IF NOT EXISTS recomendacion (
  id_recomendacion SERIAL PRIMARY KEY,
  id_hallazgo      INTEGER NOT NULL REFERENCES hallazgo(id_hallazgo) ON DELETE CASCADE,
  codigo           TEXT NOT NULL,                            -- R-01 ...
  descripcion      TEXT NOT NULL CHECK (length(trim(descripcion)) >= 10),
  prioridad        TEXT NOT NULL CHECK (prioridad IN ('ALTA','MEDIA','BAJA')),
  plazo_dias       INTEGER NOT NULL CHECK (plazo_dias BETWEEN 1 AND 730),
  responsable      TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Instantánea versionada del informe (los datos se toman de la BD al generar)
CREATE TABLE IF NOT EXISTS informe (
  id_informe         SERIAL PRIMARY KEY,
  id_auditoria       INTEGER NOT NULL REFERENCES auditoria(id_auditoria) ON DELETE CASCADE,
  version            INTEGER NOT NULL CHECK (version >= 1),
  generado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_generador       INTEGER NOT NULL REFERENCES usuario(id_usuario),
  cumplimiento_base  DOUBLE PRECISION,
  indice_ponderado   DOUBLE PRECISION,
  secciones          JSONB NOT NULL,
  contenido          JSONB NOT NULL,
  UNIQUE (id_auditoria, version)
);

CREATE TABLE IF NOT EXISTS bitacora (
  id_bitacora  SERIAL PRIMARY KEY,
  id_usuario   INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  accion       TEXT NOT NULL,
  entidad      TEXT NOT NULL,
  id_entidad   INTEGER,
  detalle      TEXT,
  fecha        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración interna (p. ej. la clave de firma de sesiones, para que sobreviva a reinicios)
CREATE TABLE IF NOT EXISTS app_config (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_eval_aud   ON evaluacion_control(id_auditoria);
CREATE INDEX IF NOT EXISTS ix_evid_eval  ON evidencia(id_evaluacion);
CREATE INDEX IF NOT EXISTS ix_hall_eval  ON hallazgo(id_evaluacion);
CREATE INDEX IF NOT EXISTS ix_reco_hall  ON recomendacion(id_hallazgo);
CREATE INDEX IF NOT EXISTS ix_inf_aud    ON informe(id_auditoria);
