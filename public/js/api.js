// Cliente HTTP de la API REST. Lanza ApiError con { status, fields, problemas }.
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Error ${status}`);
    this.status = status;
    this.fields = data?.fields || null;
    this.problemas = data?.problemas || null;
  }
}

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && !url.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  patch: (u, b = {}) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
};
