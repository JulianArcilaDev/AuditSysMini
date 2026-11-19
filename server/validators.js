// Validación en servidor (RNF03). Cada regla devuelve un mensaje de error o null.
// Las respuestas de error usan el formato { error, fields: { campo: mensaje } }
// para que el cliente muestre el mensaje junto al campo.

export class ValidationError extends Error {
  constructor(fields, message = 'Revise los campos marcados.') {
    super(message);
    this.status = 400;
    this.fields = fields;
  }
}
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));

export const r = {
  required: (label) => (v) => (v === undefined || v === null || String(v).trim() === '' ? `${label} es obligatorio.` : null),
  min: (n, label) => (v) => (v && String(v).trim().length < n ? `${label} debe tener al menos ${n} caracteres.` : null),
  max: (n, label) => (v) => (v && String(v).length > n ? `${label} admite máximo ${n} caracteres.` : null),
  date: (label) => (v) => (v && !isDate(v) ? `${label} debe ser una fecha válida (AAAA-MM-DD).` : null),
  oneOf: (list, label) => (v) => (v && !list.includes(v) ? `${label} no es válido. Valores: ${list.join(', ')}.` : null),
  int: (lo, hi, label) => (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? null : `${label} debe ser un entero entre ${lo} y ${hi}.`;
  },
  email: (label) => (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `${label} no tiene un formato válido.` : null),
};

/** Valida body contra un esquema { campo: [reglas] }. Lanza ValidationError. Devuelve valores recortados. */
export function validate(body, schema) {
  const fields = {};
  const out = {};
  for (const [key, rules] of Object.entries(schema)) {
    let v = body?.[key];
    if (typeof v === 'string') v = v.trim();
    for (const rule of rules) {
      const msg = rule(v);
      if (msg) { fields[key] = msg; break; }
    }
    out[key] = v === '' || v === undefined ? null : v;
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return out;
}

export const ESTADOS_AUDITORIA = ['BORRADOR', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA'];
export const ESTADOS_EVAL = ['IMPLEMENTADO', 'PARCIAL', 'NO_IMPLEMENTADO', 'NO_APLICABLE'];
export const SEVERIDADES = ['ALTA', 'MEDIA', 'BAJA'];
export const TIPOS_EVIDENCIA = ['Documental', 'Entrevista', 'Observación', 'Técnica', 'Fotográfica'];
export const CATEGORIAS = ['Organizacional', 'Personas', 'Físico', 'Tecnológico'];
export const MIN_CONTROLES = 10;
export const MAX_CONTROLES = 15;
export const MIN_HALLAZGOS = 3;
