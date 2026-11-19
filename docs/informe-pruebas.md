# Informe de pruebas · AuditSys Mini

**Fecha de ejecución:** 18 de noviembre de 2026 · **Versión:** 1.0.0 · **Entorno:** macOS, Node.js 22.14, SQLite 3.47 (integrado)

## 1. Pruebas automatizadas (`npm test`)

Se ejecutan contra una base de datos temporal, con el servidor real (HTTP) y las mismas reglas que usa la interfaz.

| ID | Caso | Datos de entrada | Resultado esperado | Resultado |
|---|---|---|---|---|
| — | Autenticación | Sin sesión; contraseña errónea; credenciales válidas | 401, 401, 200 | ✅ Aprobado |
| CP-01 | Crear auditoría válida | Datos completos de Empresa ABC | Queda en la lista en estado Borrador | ✅ Aprobado |
| CP-02 | Crear auditoría incompleta | Fecha de cierre vacía; fecha de cierre anterior a la de inicio | Mensaje junto al campo `fecha_fin`; no se guarda | ✅ Aprobado |
| CP-03 | Selección fuera de rango | 9 controles y luego 16 | Se bloquea el paso a ejecución con mensaje del rango 10 a 15; con 13 se permite | ✅ Aprobado |
| CP-04 | Evaluar sin observación | Estado Parcial, observación vacía | Se rechaza (400, campo `observacion`) | ✅ Aprobado |
| CP-05 | No aplicable sin justificación | Control 8.31 sin justificación | Se rechaza; con justificación se guarda y sale del denominador | ✅ Aprobado |
| CP-06 | Implementado sin evidencia | Control 5.1 sin evidencia | Advertencia y bloqueo del paso a revisión; evidencia sin referencia ni archivo rechazada; archivo `.exe` rechazado | ✅ Aprobado |
| CP-07 | Hallazgo incompleto | Hallazgo sin causa | Se rechaza; completo genera `H-01` y `R-01` | ✅ Aprobado |
| CP-08 | Cierre sin recomendación | Menos de 3 hallazgos; luego un hallazgo sin recomendación | Se impide el cierre en ambos casos | ✅ Aprobado |
| CP-09 | Cálculo de indicadores | 4 I, 5 P, 3 NI, 1 N/A | 33,3 % base y 54,2 % ponderado | ✅ Aprobado |
| CP-10 | Generación de informe | Auditoría completa | Informe versionado coincide con la BD, marca evidencias simuladas e incluye limitaciones | ✅ Aprobado |
| CP-11 | Dashboard | Datos de la auditoría | Valores iguales a los del informe | ✅ Aprobado |
| CP-12 | Persistencia | Cerrar y reabrir la conexión a la BD | Los datos permanecen | ✅ Aprobado |
| CP-13 | Acceso por rol y cierre | Auditor edita catálogo; auditor ajeno edita evaluación; edición tras cierre | 403, 403 y 409 (acceso denegado) | ✅ Aprobado |
| — | Integridad en BD | `UPDATE`/`INSERT` directos que violan reglas | Rechazados por `CHECK` y `FOREIGN KEY` | ✅ Aprobado |

**Total:** 15 pruebas · 15 aprobadas · 0 fallidas.

## 2. Pruebas manuales en navegador

| Caso | Resultado |
|---|---|
| Inicio de sesión con campos vacíos muestra el error junto a cada campo | ✅ |
| Dashboard muestra 33,3 % / 54,2 %, anillo por estado, severidades, categorías y auditorías recientes | ✅ |
| Nueva auditoría con fecha de cierre anterior: error en línea, conserva lo digitado; corregida se guarda | ✅ |
| Selección con la sugerencia del ejemplo (13), contador en verde, guardar e iniciar ejecución | ✅ |
| Evaluación N/A sin justificación rechazada; Implementado sin evidencia muestra advertencia | ✅ |
| Registro de evidencia sin referencia rechazado; con referencia genera `EV-01` | ✅ |
| Hallazgo sin causa rechazado; completo genera `H-01` con `R-01` | ✅ |
| Matriz de trazabilidad muestra la cadena y alerta los controles sin evaluar | ✅ |
| Informe versión 1 generado con las 8 secciones; vista de impresión | ✅ |
| Auditor no ve la opción de editar el catálogo | ✅ |
| Vista móvil (375 px): menú plegable, una columna, sin desplazamiento horizontal | ✅ |

## 3. Defectos encontrados y corregidos

| # | Defecto | Corrección |
|---|---|---|
| 1 | Campos opcionales no enviados causaban error 500 (el controlador SQLite no acepta `undefined`) | El validador normaliza los valores ausentes a `NULL` |
| 2 | Los radios ocultos del selector de estado generaban desplazamiento horizontal | Se posicionan dentro de su etiqueta |
| 3 | La vista previa del informe no mostraba contenido | Se corrigió el acceso a `preview.contenido` |
| 4 | Mensajes de validación con concordancia de género incorrecta («Contraseña es obligatorio») | Mensajes neutros junto al campo |

## 4. Pendientes / limitaciones conocidas

- La exportación a PDF usa la impresión del navegador (*Imprimir → Guardar como PDF*), permitida por el documento orientador («PDF o formato imprimible»).
- No hay recuperación de contraseña por correo; el administrador crea y reactiva cuentas.
