import { api } from '../api.js';
import { html, field, bindForm } from '../ui.js';

export function render(el, _params, { onLogin }) {
  el.innerHTML = html`<div class="login">
    <section class="login-hero">
      <img src="img/favicon.svg" alt="" width="56" height="56">
      <h1>AuditSys Mini</h1>
      <p>Sistema de gestión de auditorías de sistemas de información, con trazabilidad entre criterios, controles, evidencias, hallazgos y recomendaciones.</p>
      <ul>
        <li>Catálogo ISO/IEC 27002:2022 (93 controles)</li>
        <li>Evaluación de 10 a 15 controles por auditoría</li>
        <li>Evidencias, hallazgos y recomendaciones vinculados</li>
        <li>Indicadores con fórmula explícita e informe imprimible</li>
      </ul>
      <p><small style="color:#8fb0cf">Referentes: ISO 19011:2018 · ISO/IEC 27001:2022 · ISO/IEC 27002:2022. La herramienta no certifica organizaciones.</small></p>
    </section>
    <section class="login-box">
      <div class="card">
        <h2>Iniciar sesión</h2>
        <p class="muted">Ingrese con su cuenta de auditor o administrador.</p>
        <form class="form" id="login-form">
          <div class="form-error" tabindex="-1" role="alert"></div>
          ${field({ name: 'correo', label: 'Correo', type: 'email', required: true, attrs: 'autocomplete="username"' })}
          ${field({ name: 'password', label: 'Contraseña', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
          <button class="btn" type="submit">Ingresar</button>
        </form>
        <div class="demo-creds"><strong>Entorno académico:</strong> las cuentas de prueba están documentadas en el archivo <code>README.md</code> del proyecto.</div>
      </div>
    </section>
  </div>`.s;
  bindForm(el.querySelector('#login-form'), async (data) => {
    const u = await api.post('/auth/login', data);
    onLogin(u);
  });
}
