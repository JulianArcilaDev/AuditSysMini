// Administración de usuarios y roles (solo admin, RNF04).
import { api } from '../api.js';
import { html, icon, field, bindForm, toast, modal, fechaHora } from '../ui.js';
import { reload } from '../app.js';

export async function render(el, _p, { user }) {
  const users = await api.get('/usuarios');
  el.innerHTML = html`
  <div class="page-head">
    <div><h1>Usuarios</h1><p>Cuentas y roles. <strong>Auditor:</strong> gestiona sus auditorías y consulta el catálogo. <strong>Administrador:</strong> además administra catálogo y usuarios.</p></div>
    <button class="btn" id="nuevo">${icon('plus')} Nuevo usuario</button>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
    <tbody>${users.map((u) => html`<tr>
      <td>${u.nombre}</td><td>${u.correo}</td>
      <td>${u.id_usuario === user.id_usuario ? u.rol : html`<select data-rol="${u.id_usuario}" aria-label="Rol de ${u.nombre}"><option value="auditor" ${u.rol === 'auditor' ? html`selected` : ''}>auditor</option><option value="admin" ${u.rol === 'admin' ? html`selected` : ''}>admin</option></select>`}</td>
      <td>${u.activo ? html`<span class="chip IMPLEMENTADO">Activo</span>` : html`<span class="chip NO_APLICABLE">Inactivo</span>`}</td>
      <td><small>${fechaHora(u.creado_en)}</small></td>
      <td>${u.id_usuario === user.id_usuario ? html`<small class="muted">(usted)</small>` : html`<button class="btn secondary sm" data-toggle="${u.id_usuario}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}</td>
    </tr>`)}</tbody></table></div>`.s;

  el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    await api.patch(`/usuarios/${b.dataset.toggle}`, { activo: b.dataset.activo === '1' ? 0 : 1 });
    toast('Usuario actualizado.');
    reload();
  }));
  el.querySelectorAll('[data-rol]').forEach((s) => s.addEventListener('change', async () => {
    await api.patch(`/usuarios/${s.dataset.rol}`, { rol: s.value });
    toast('Rol actualizado.');
  }));
  el.querySelector('#nuevo').addEventListener('click', () => {
    const dlg = modal('Nuevo usuario', html`<form class="form" id="u-form">
      <div class="form-error" tabindex="-1" role="alert"></div>
      ${field({ name: 'nombre', label: 'Nombre', required: true, minlength: 3 })}
      ${field({ name: 'correo', label: 'Correo', type: 'email', required: true })}
      ${field({ name: 'password', label: 'Contraseña inicial', type: 'password', required: true, minlength: 8, help: 'Mínimo 8 caracteres, con letras y números.', attrs: 'autocomplete="new-password"' })}
      ${field({ name: 'rol', label: 'Rol', type: 'select', value: 'auditor', required: true, options: [{ value: 'auditor', label: 'Auditor' }, { value: 'admin', label: 'Administrador' }] })}
      <div class="actions" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" type="submit">Crear usuario</button></div>
    </form>`);
    bindForm(dlg.querySelector('#u-form'), async (d) => {
      await api.post('/usuarios', d);
      toast('Usuario creado.');
      dlg.close();
      reload();
    });
  });
}
