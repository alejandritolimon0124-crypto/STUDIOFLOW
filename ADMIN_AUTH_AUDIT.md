# FASE 16.1B - ADMIN AUTH AUDIT

## Objetivo

Auditar el sistema real de roles administrativos de Studio Flow.

Este documento no implementa codigo, no crea SQL, no crea RPCs y no modifica politicas. Solo describe el estado actual de autenticacion, roles, permisos, scopes y rutas funcionales.

## Resumen ejecutivo

Studio Flow tiene tres capas distintas de autorizacion:

| Capa | Estado actual |
|---|---|
| `profiles.default_role` | Existe en Supabase y puede contener `platform_owner`, `studio_owner`, `studio_manager`, `artist`, `client`. |
| `user_role_assignments` | Existe y es la fuente real de roles activos/scoped para `studio_flow_get_auth_context` y `studio_flow_admin_get_artists`. |
| Permisos frontend | Son estaticos en `src/modules/permissions/rolePermissions.js`, no vienen de Supabase. |

Conclusion principal:

- No existe UI ni flujo publico funcional para crear `platform_owner`, `studio_owner` o `studio_manager` reales.
- Si el usuario admin real ya existe en Supabase con `profiles.default_role` correcto, puede iniciar sesion.
- Para `studio_owner` y `studio_manager`, iniciar sesion puede funcionar, pero el acceso scoped real a datos admin depende de `user_role_assignments.studio_id`.
- `permissions` y `role_permissions` existen en DB, pero hoy no gobiernan AppContext ni la RPC Admin Wave A.

## Tablas reales de roles y permisos

| Tabla | Uso actual |
|---|---|
| `profiles` | Guarda identidad app, `default_role`, estado y contacto. |
| `roles` | Catalogo DB de roles (`platform_owner`, `studio_owner`, `studio_manager`, `artist`, `client`). |
| `permissions` | Catalogo DB de permisos. Existe, pero no es consultado por frontend ni RPC Admin Wave A. |
| `role_permissions` | Relacion DB rol-permiso. Existe, pero no es consultada por frontend ni RPC Admin Wave A. |
| `user_role_assignments` | Asignaciones reales de rol por profile, con `studio_id` opcional y `status`. |
| `studios` | Tiene `owner_profile_id`, pero la RPC Admin Wave A no lo usa como scope directo. |
| `artist_studio_memberships` | Relaciona artistas con studios. No asigna roles admin; sirve para scope de artistas/studios. |

## `default_role`

`profile_default_role` permite:

- `platform_owner`
- `studio_owner`
- `studio_manager`
- `artist`
- `client`

Se almacena en `profiles.default_role`.

Origenes actuales:

| Origen | Comportamiento |
|---|---|
| `handle_new_auth_user()` | Lee `new.raw_user_meta_data.default_role`; si no existe, usa `client`. |
| `studio_flow_bootstrap_profile(...)` | Inserta/actualiza profile y llama `studio_flow_assign_role(..., p_default_role, null)`. |
| `registerClient` | Llama signup con `defaultRole = client`; luego bootstrap client. |
| `registerArtist` | Llama signup con `defaultRole = artist`; luego bootstrap artist. |
| UI actual | No expone registro admin real. |

Riesgo: el trigger `handle_new_auth_user()` crea `profiles.default_role`, pero no llama `studio_flow_assign_role`. Si se crea un usuario admin solo por metadata, puede tener `default_role` admin sin fila correspondiente en `user_role_assignments`.

## `user_role_assignments`

Estructura clave:

| Campo | Significado |
|---|---|
| `profile_id` | Usuario app. |
| `role_id` | Rol desde `roles`. |
| `studio_id` | Scope opcional. Requerido para admin scoped util. |
| `status` | `active`, `revoked`, `archived`. |
| `assigned_by_profile_id` | Actor que asigno, si se registra. |

Uso actual:

- `studio_flow_get_auth_context()` devuelve `roles` consultando `user_role_assignments` activos.
- `createSessionFromAuthContext()` usa `roles` para determinar `session.role` si hay match con `profiles.default_role`.
- `studio_flow_admin_get_artists()` usa:
  - role assignment `platform_owner` para acceso global.
  - role assignment `studio_owner`/`studio_manager` con `studio_id` para scope.
  - fallback `profiles.default_role = 'platform_owner'` solo para platform owner.

Gap importante:

- `studios.owner_profile_id` no basta para la RPC Admin Wave A.
- Un `studio_owner` real sin `user_role_assignments.studio_id` inicia sesion como admin, pero `studio_flow_admin_get_artists()` devuelve lista vacia.

## `permissions` y `role_permissions`

Las tablas existen, pero hoy no son autoridad efectiva para AppContext.

Frontend usa permisos estaticos:

| Archivo | Uso |
|---|---|
| `src/modules/permissions/rolePermissions.js` | Define `permissions`, `permissionsByRole`, `hasPermission`. |
| `src/layouts/AdminLayout.jsx` | Muestra tabs admin usando `hasPermission`. |
| `src/layouts/DashboardLayout.jsx` | Filtra navegacion admin usando `hasPermission`. |
| `src/pages/admin/AdminArtists.jsx` | Usa `hasPermission(..., STUDIO_REVENUE)` para mostrar revenue. |
| `src/pages/admin/AdminDashboard.jsx` | Usa permisos estaticos para secciones admin. |

La DB `permissions`/`role_permissions` no se consulta en:

- `fetchAuthContext`
- `createSessionFromAuthContext`
- `hasPermission`
- `studio_flow_admin_get_artists`

Implicacion: cambiar permisos en Supabase no cambia permisos del frontend ni de la RPC actual.

## Memberships

Hay dos conceptos distintos:

| Concepto | Tabla | Uso |
|---|---|---|
| Role assignment admin | `user_role_assignments` | Autoriza roles de usuario y scope por studio. |
| Membership artist-studio | `artist_studio_memberships` | Relaciona artistas con estudios. No autoriza admin por si sola. |

`studio_flow_get_auth_context()` devuelve memberships solo del artista actual si existe `authContext.artist`. No devuelve memberships administrativos para `studio_owner`/`studio_manager`.

`studio_flow_admin_get_artists()` usa `artist_studio_memberships` para encontrar artistas dentro de los studios autorizados por `user_role_assignments`.

## Como se crea cada rol hoy

### 1. `platform_owner`

Rutas posibles actuales:

| Ruta | Funcional | Comentario |
|---|---|---|
| UI publica | No | `Register.jsx` solo crea cliente o artista. |
| Demo login | Si, mock | `Login.jsx` tiene `Entrar como admin demo`; no crea usuario real. |
| Metadata de Auth + trigger | Parcial | Si `raw_user_meta_data.default_role = platform_owner`, `handle_new_auth_user()` crea profile con default_role. No crea role assignment. |
| `studio_flow_bootstrap_profile(..., 'platform_owner')` | Tecnica, no expuesta | La funcion soporta el enum y llama `studio_flow_assign_role`, pero no hay wrapper/route UI para administradores. |
| Insercion SQL manual | Si | Crear `auth.users`, `profiles`, `user_role_assignments` o usar funciones internas. |

Respuesta: no existe una ruta funcional de producto para crear un `platform_owner` real. Existe una ruta tecnica/manual.

### 2. `studio_owner`

Rutas posibles actuales:

| Ruta | Funcional | Comentario |
|---|---|---|
| UI publica | No | `Register.jsx` no ofrece studio owner real. |
| Demo login | Si, mock | `Entrar como studio owner demo`. |
| Metadata de Auth + trigger | Parcial | Puede crear `profiles.default_role = studio_owner`, pero sin `user_role_assignments.studio_id`. |
| `studio_flow_bootstrap_profile(..., 'studio_owner')` | Tecnica, no expuesta | Crearia assignment sin `studio_id` si se usara asi. No basta para scope admin Wave A. |
| SQL/manual admin | Si | Debe crear profile, role assignment `studio_owner` con `studio_id`, y studio relacionado. |

Respuesta: no existe ruta funcional de producto para crear `studio_owner` real scoped. Requiere provisioning manual o RPC futura.

### 3. `studio_manager`

Rutas posibles actuales:

| Ruta | Funcional | Comentario |
|---|---|---|
| UI publica | No | No hay registro manager. |
| Demo login | Si, mock | `Entrar como manager demo`. |
| Metadata de Auth + trigger | Parcial | Puede crear `profiles.default_role = studio_manager`, pero sin scope. |
| `studio_flow_bootstrap_profile(..., 'studio_manager')` | Tecnica, no expuesta | Crearia assignment sin `studio_id` si se usara asi. |
| SQL/manual admin | Si | Debe crear assignment `studio_manager` con `studio_id`. |

Respuesta: no existe ruta funcional de producto para crear `studio_manager` real scoped.

## Login real por rol

### `platform_owner`

| Pregunta | Respuesta |
|---|---|
| Existe ruta funcional para iniciar sesion como `platform_owner` real? | Si, si el usuario ya existe en Auth/Profile. |
| Ruta | `Login.jsx` -> `loginWithPassword` -> Supabase Auth -> `hydrateSupabaseSession` -> `studio_flow_get_auth_context`. |
| Requisito minimo | `profiles.default_role = platform_owner` o role assignment activo `platform_owner`. |
| Admin route | `ProtectedRoute` permite `platform_owner` en `/admin`. |
| RPC Admin Wave A | Permite global si role assignment `platform_owner` o `profiles.default_role = platform_owner`. |

Nota: este es el unico admin role con fallback directo en la RPC Wave A por `profiles.default_role`.

### `studio_owner`

| Pregunta | Respuesta |
|---|---|
| Existe ruta funcional para iniciar sesion como `studio_owner` real? | Si, si el usuario ya existe con profile/role correcto. |
| Ruta | Igual que login real general. |
| Requisito minimo para entrar a `/admin` | `session.role = studio_owner`, derivado de `default_role` o `user_role_assignments`. |
| Requisito para ver datos en RPC Admin Wave A | `user_role_assignments` activo con role `studio_owner` y `studio_id`. |
| Riesgo actual | Si solo tiene `profiles.default_role = studio_owner`, puede entrar a admin pero la RPC devuelve vacio. |

### `studio_manager`

| Pregunta | Respuesta |
|---|---|
| Existe ruta funcional para iniciar sesion como `studio_manager` real? | Si, si el usuario ya existe con profile/role correcto. |
| Ruta | Igual que login real general. |
| Requisito minimo para entrar a `/admin` | `session.role = studio_manager`. |
| Requisito para ver datos en RPC Admin Wave A | `user_role_assignments` activo con role `studio_manager` y `studio_id`. |
| Riesgo frontend | `permissionsByRole[studio_manager]` no incluye `STUDIO_ARTISTS`, por lo que la navegacion puede ocultar Admin Artists aunque la ruta admin permita el rol. |

## Permisos usados por AppContext

AppContext no consulta permisos DB.

| Punto | Uso |
|---|---|
| `createSessionFromAuthContext` | Deriva `session.role` desde `profiles.default_role` y `authContext.roles`. |
| `activeSessionContext` | Guarda `role`, `studioId`, `artistId`, `clientId`, `membershipId`. |
| `loadAdminArtists` | Corre para `platform_owner`, `studio_owner`, `studio_manager`. |
| `hasPermission` | No vive en AppContext; se usa en layout/pages con matriz JS estatica. |

Permisos de UI relevantes:

| Rol | Permisos estaticos relevantes |
|---|---|
| `platform_owner` | `GOVERNANCE`, `STUDIOS`, `GLOBAL_REVENUE`, `GLOBAL_INSIGHTS`, `ECOSYSTEM_RISK`, `STUDIO_REVENUE`, `STUDIO_ARTISTS`, `STUDIO_MARKETING`, `STUDIO_OCCUPANCY`, `STUDIO_CLIENTS`, `AGENDA`, `CLIENTS`. |
| `studio_owner` | `STUDIO_REVENUE`, `STUDIO_ARTISTS`, `STUDIO_MARKETING`, `STUDIO_OCCUPANCY`, `STUDIO_CLIENTS`, `AGENDA`, `CLIENTS`. |
| `studio_manager` | `AGENDA`, `CLIENTS`, `STUDIO_MARKETING`, `STUDIO_OCCUPANCY`. |

## Permisos usados por RPC Admin Wave A

`studio_flow_admin_get_artists` no usa `permissions` ni `role_permissions`.

Usa:

| Validacion | Fuente |
|---|---|
| Usuario autenticado | `auth.uid()` |
| Profile activo | `profiles.status = active` |
| Platform global | `user_role_assignments` con `roles.code = platform_owner` o `profiles.default_role = platform_owner` |
| Studio scoped | `user_role_assignments` con `roles.code in ('studio_owner', 'studio_manager')` y `studio_id` no nulo |
| Artist scope | `artist_studio_memberships.studio_id` dentro de studios scoped |

Gap: no valida permiso efectivo `STUDIO_ARTISTS`; valida rol. Por eso DB y frontend pueden divergir.

## Respuestas directas

| Pregunta | Respuesta |
|---|---|
| Existe ruta funcional para crear un `platform_owner` real? | No como producto/UI. Solo tecnica/manual mediante metadata/SQL/funciones no expuestas. |
| Existe ruta funcional para iniciar sesion como `platform_owner` real? | Si, si el usuario ya existe con `profiles.default_role = platform_owner` o assignment activo. |
| Existe ruta funcional para iniciar sesion como `studio_owner` real? | Si, si el usuario ya existe con rol real. Para datos scoped necesita `user_role_assignments.studio_id`. |
| Existe ruta funcional para iniciar sesion como `studio_manager` real? | Si, si el usuario ya existe con rol real. Para datos scoped necesita `user_role_assignments.studio_id`; la UI puede ocultar Admin Artists por permisos estaticos. |

## Riesgos

| Riesgo | Impacto |
|---|---|
| No hay provisioning admin real | No se puede crear admin desde el producto. |
| `handle_new_auth_user` no crea role assignment | Usuarios creados por metadata pueden tener `default_role` sin assignment. |
| `studio_owner` sin `studio_id` scoped | Entra a admin pero ve listas vacias en RPC Wave A. |
| `permissions` DB no usados | Cambios en DB no afectan frontend ni RPC. |
| `studio_manager` permitido por ruta pero sin `STUDIO_ARTISTS` en JS | Puede haber acceso inconsistente a Admin Artists. |
| `studio_flow_assign_role` no tiene grant explicito y no esta envuelta por RPC admin | No hay flujo seguro de asignacion desde app. |

## Recomendacion para fases futuras

Antes de ampliar escrituras Admin Artists, crear una fase de provisioning admin:

- `studio_flow_admin_create_platform_owner` solo service/admin bootstrap controlado.
- `studio_flow_admin_create_studio_owner`.
- `studio_flow_admin_create_studio_manager`.
- `studio_flow_admin_assign_role`.
- `studio_flow_admin_revoke_role`.
- `studio_flow_get_effective_permissions`.

Y decidir una fuente unica para permisos:

1. Mantener matriz JS estatica y documentarla como UI-only.
2. Migrar `hasPermission` a permisos efectivos desde Supabase.

## Veredicto

La autenticacion real de admins puede funcionar si las filas correctas ya existen, pero Studio Flow todavia no tiene una ruta de producto para crear administradores reales.

El punto mas delicado es `studio_owner`/`studio_manager`: `default_role` permite construir una sesion admin, pero el acceso real a datos scoped depende de `user_role_assignments.studio_id`. Sin esa fila, el login puede ser correcto y la UI puede abrir `/admin`, pero las RPC reales devolveran datos vacios.
