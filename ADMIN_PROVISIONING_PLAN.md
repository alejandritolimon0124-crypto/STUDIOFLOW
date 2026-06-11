# FASE 16.1C - ADMIN PROVISIONING PLAN

## Objetivo

Disenar el sistema real de creacion, asignacion y revocacion de administradores de Studio Flow.

Este documento no implementa codigo, no crea SQL, no crea RPCs y no modifica politicas. Define el modelo tecnico futuro para provisioning administrativo.

## Fuentes auditadas

| Fuente | Hallazgo |
|---|---|
| `studio_flow_assign_role` | Existe como primitiva interna `SECURITY DEFINER`, inserta assignments activos si no existen, pero no valida actor, no audita y no revoca. |
| `roles` | Catalogo real de roles del sistema. |
| `user_role_assignments` | Fuente real para roles activos y scopes por `studio_id`. |
| `profiles.default_role` | Rol preferido/base de sesion, pero no reemplaza los assignments scoped. |
| `studio_flow_bootstrap_profile` | Crea/actualiza profile y llama `studio_flow_assign_role(..., p_default_role, null)`. Para admins scoped esto deja el rol sin `studio_id`. |
| `handle_new_auth_user` | Crea `profiles.default_role` desde metadata, pero no crea `user_role_assignments`. |
| `audit_events` | Permite `entity_type = 'user_role_assignment'`, `profile`, `role`, `studio` y `audit_event`, utiles para provisioning. |

## Diagnostico actual

Studio Flow ya tiene las piezas de datos para roles administrativos reales, pero no tiene un flujo de producto para crearlos.

| Pieza | Estado |
|---|---|
| `profiles.default_role` | Disponible y usado para construir sesion. |
| `roles` | Disponible como catalogo. |
| `user_role_assignments` | Disponible y necesario para scopes reales. |
| `studio_flow_assign_role` | Util como helper interno, no suficiente como RPC publica/admin. |
| UI de provisioning admin | No existe. |
| Auditoria de provisioning | No existe. |

Conclusion: el provisioning debe construirse sobre `user_role_assignments`, manteniendo `profiles.default_role` sincronizado como rol preferido de sesion, pero sin usarlo como unica fuente de autorizacion.

## Principios de diseno

1. Ningun rol administrativo debe crearse desde registro publico.
2. `platform_owner` inicial debe crearse por un flujo controlado de bootstrap, no por UI abierta.
3. `studio_owner` y `studio_manager` siempre requieren `studio_id`.
4. `platform_owner` debe ser global y no debe tener `studio_id`.
5. Toda asignacion o revocacion debe ser RPC `SECURITY DEFINER`.
6. No debe haber escrituras directas desde frontend a `roles`, `role_permissions` ni `user_role_assignments`.
7. Revocar no debe borrar filas; debe usar `status = 'revoked'` y `revoked_at`.
8. Toda mutacion debe escribir `audit_events`.
9. Debe bloquearse la revocacion del ultimo `platform_owner` activo.
10. `profiles.default_role` debe recalcularse despues de cambios de rol para evitar sesiones inconsistentes.

## Relacion entre `default_role` y assignments

| Campo | Responsabilidad |
|---|---|
| `profiles.default_role` | Rol preferido para construir UX/sesion inicial. |
| `user_role_assignments` | Autoridad real para roles activos, scopes y permisos backend. |
| `roles` | Catalogo canonico de codigos de rol. |

Regla propuesta:

- El login puede usar `default_role` como preferencia.
- Las RPC administrativas deben autorizar con `user_role_assignments`.
- Si un usuario tiene rol scoped (`studio_owner` o `studio_manager`) sin `studio_id`, el rol debe considerarse incompleto para operaciones reales.
- Si se revoca el rol que coincide con `default_role`, debe recalcularse `default_role` usando el rol activo de mayor prioridad.

Prioridad sugerida:

| Prioridad | Rol |
|---|---|
| 1 | `platform_owner` |
| 2 | `studio_owner` |
| 3 | `studio_manager` |
| 4 | `artist` |
| 5 | `client` |

## RPC necesarias

| RPC | Proposito | Actor permitido |
|---|---|---|
| `studio_flow_system_bootstrap_platform_owner` | Crear o completar el primer `platform_owner`. | Flujo tecnico one-time, no UI publica. |
| `studio_flow_admin_get_role_assignments` | Listar roles efectivos y scopes para administracion. | `platform_owner`; `studio_owner` scoped para su studio. |
| `studio_flow_admin_assign_role` | Asignar rol administrativo con validaciones y auditoria. | `platform_owner`; `studio_owner` solo para managers de su studio. |
| `studio_flow_admin_revoke_role` | Revocar assignment activo. | `platform_owner`; `studio_owner` solo para managers de su studio. |
| `studio_flow_admin_create_studio_owner` | Wrapper especifico para owner scoped. | `platform_owner`. |
| `studio_flow_admin_create_studio_manager` | Wrapper especifico para manager scoped. | `platform_owner` o `studio_owner` del mismo studio. |
| `studio_flow_admin_recalculate_default_role` | Recalcular `profiles.default_role` tras asignar/revocar. | Interna, llamada por RPCs admin. |
| `studio_flow_get_effective_permissions` | Devolver permisos efectivos si se migra la matriz JS a DB. | Usuario autenticado activo. |

Nota: crear usuarios de Supabase Auth no debe hacerse desde SQL expuesto al cliente. Para usuarios que aun no existen, el flujo futuro debe usar una Edge Function/server endpoint con Supabase Admin API para invitacion/creacion, y luego llamar las RPC de asignacion sobre el `profile_id` creado.

## 1. Bootstrap inicial de `platform_owner`

### Problema

El primer `platform_owner` no puede ser creado por otro admin porque todavia no existe admin. Por eso necesita un mecanismo especial de una sola vez.

### Flujo recomendado

1. Crear el usuario en Supabase Auth mediante Dashboard, CLI, seed controlado o Supabase Admin API.
2. Crear o completar `profiles` para ese `auth.users.id`.
3. Asegurar `roles.code = 'platform_owner'`.
4. Crear `user_role_assignments` activo con:
   - `profile_id = platform_owner_profile_id`
   - `role_id = platform_owner_role_id`
   - `studio_id = null`
   - `status = 'active'`
5. Actualizar `profiles.default_role = 'platform_owner'`.
6. Escribir auditoria tecnica.

### RPC propuesta

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_system_bootstrap_platform_owner` |
| Tipo | `SECURITY DEFINER`, solo ejecutable en contexto tecnico controlado. |
| Parametros | `p_profile_id uuid`, `p_reason text`, `p_bootstrap_token text` si se decide usar token. |
| Validacion central | Permitir solo si no existe ningun `platform_owner` activo, salvo modo break-glass controlado. |
| Tablas | `profiles`, `roles`, `user_role_assignments`, `audit_events`. |
| Auditoria | `entity_type = 'user_role_assignment'`, `event_type = 'platform_owner_bootstrapped'`. |

Recomendacion: no exponer esta RPC a `authenticated` general. Debe ejecutarse por deployment/ops o por una Edge Function protegida.

## 2. Creacion de `studio_owner`

### Flujo futuro UI

`Admin Platform -> Studios -> Administradores -> Asignar owner`

1. Platform owner selecciona un studio.
2. Busca un usuario existente por email o envia invitacion.
3. Selecciona rol `studio_owner`.
4. Confirma asignacion scoped.
5. UI refresca assignments y datos del studio.

### RPC recomendada

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_create_studio_owner` |
| Parametros | `p_profile_id uuid`, `p_studio_id uuid`, `p_set_as_primary_owner boolean default false`, `p_reason text default null` |
| Actor permitido | `platform_owner` activo. |
| Tablas | `profiles`, `roles`, `studios`, `user_role_assignments`, opcional `audit_events`. |
| Resultado | Assignment activo y payload de rol/studio/profile. |

Validaciones:

- Actor autenticado y profile activo.
- Actor tiene assignment activo `platform_owner`.
- Target profile existe y `status = 'active'`.
- Studio existe y no esta archivado/suspendido.
- Rol `studio_owner` existe en `roles`.
- `p_studio_id` es obligatorio.
- No crear duplicado activo para mismo profile/rol/studio.
- Si existia assignment revocado, crear uno nuevo o reactivarlo solo con auditoria explicita.
- Si `p_set_as_primary_owner = true`, actualizar `studios.owner_profile_id` si el modelo permite un owner primario.
- Actualizar `profiles.default_role` a `studio_owner` solo si el usuario no tiene un rol de mayor prioridad.

Auditoria:

| Campo | Valor recomendado |
|---|---|
| `context` | `identity` o `studio` |
| `entity_type` | `user_role_assignment` |
| `entity_id` | id del assignment |
| `studio_id` | studio asignado |
| `event_type` | `studio_owner_assigned` |
| `before_data` | null o assignment previo revocado |
| `after_data` | assignment activo |
| `metadata` | reason, target_profile_id, set_as_primary_owner |

## 3. Creacion de `studio_manager`

### Flujo futuro UI

`Admin Studio -> Equipo -> Agregar manager`

1. Platform owner o studio owner abre administracion de equipo.
2. Selecciona usuario existente o invita por email.
3. Asigna rol `studio_manager` al studio actual.
4. Confirma permisos visibles.

### RPC recomendada

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_create_studio_manager` |
| Parametros | `p_profile_id uuid`, `p_studio_id uuid`, `p_reason text default null` |
| Actor permitido | `platform_owner` o `studio_owner` activo del mismo `studio_id`. |
| Tablas | `profiles`, `roles`, `studios`, `user_role_assignments`, `audit_events`. |
| Resultado | Assignment activo scoped. |

Validaciones:

- Actor autenticado y profile activo.
- Actor es `platform_owner` o `studio_owner` del mismo studio.
- Target profile activo.
- Studio activo.
- `p_studio_id` obligatorio.
- Rol `studio_manager` existe.
- No duplicar assignment activo.
- No permitir que un studio owner se asigne a si mismo roles superiores.
- No sobrescribir `profiles.default_role = platform_owner` o `studio_owner`; solo cambiar a `studio_manager` si el usuario no tiene rol activo de mayor prioridad.

Auditoria:

| Campo | Valor recomendado |
|---|---|
| `context` | `studio` |
| `entity_type` | `user_role_assignment` |
| `event_type` | `studio_manager_assigned` |
| `studio_id` | studio asignado |
| `metadata` | reason, assigned_by_role |

## 4. Revocacion de roles

### Flujo futuro UI

`Admin -> Equipo/Administradores -> Revocar acceso`

1. Actor selecciona assignment activo.
2. UI muestra alcance: rol, studio y usuario afectado.
3. Actor captura motivo obligatorio para roles admin.
4. RPC revoca y recalcula `default_role`.

### RPC recomendada

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_revoke_role` |
| Parametros | `p_assignment_id uuid`, `p_reason text` |
| Actor permitido | `platform_owner`; `studio_owner` solo para `studio_manager` del mismo studio. |
| Tablas | `user_role_assignments`, `profiles`, `roles`, `audit_events`. |
| Resultado | Assignment revocado y nuevo `default_role`. |

Validaciones:

- Assignment existe y esta `active`.
- Actor no puede revocar su ultimo rol administrativo sin flujo break-glass.
- Nadie puede revocar el ultimo `platform_owner` activo.
- Studio owner no puede revocar `platform_owner` ni `studio_owner`.
- Studio owner solo puede revocar managers del mismo `studio_id`.
- Revocacion es soft:
  - `status = 'revoked'`
  - `revoked_at = now()`
  - `assigned_by_profile_id` no debe perderse
- Recalcular `profiles.default_role` desde assignments activos restantes.

Auditoria:

| Campo | Valor recomendado |
|---|---|
| `context` | `identity` |
| `entity_type` | `user_role_assignment` |
| `entity_id` | assignment revocado |
| `event_type` | `admin_role_revoked` |
| `before_data` | assignment activo |
| `after_data` | assignment revocado |
| `metadata` | reason, previous_default_role, new_default_role |

## 5. Asignacion de `studio_id` scoped

Reglas obligatorias:

| Rol | `studio_id` |
|---|---|
| `platform_owner` | Debe ser `null`. |
| `studio_owner` | Obligatorio. |
| `studio_manager` | Obligatorio. |
| `artist` | Puede ser `null`; relacion con studio vive en `artist_studio_memberships`. |
| `client` | Debe ser `null` salvo futuro scope especial. |

`studio_id` debe validarse contra `studios.id` y estado activo. Para roles scoped, la ausencia de `studio_id` debe ser error, no warning.

Decision pendiente:

| Tema | Opciones |
|---|---|
| Multiples owners por studio | Permitir varios `studio_owner` scoped o limitar a uno primario. |
| `studios.owner_profile_id` | Usarlo como owner primario informativo o convertirlo en constraint de negocio. |
| Managers multi-studio | Permitir multiples assignments `studio_manager`, uno por studio. |

Recomendacion: permitir multiples assignments scoped y tratar `studios.owner_profile_id` como owner primario opcional, no como unica fuente de autorizacion.

## Permisos requeridos

| Accion | Permiso backend requerido |
|---|---|
| Bootstrap primer platform owner | Token/ops one-time y ausencia de platform owner activo. |
| Crear platform owner adicional | `platform_owner` activo. |
| Crear studio owner | `platform_owner` activo. |
| Crear studio manager | `platform_owner` o `studio_owner` activo del mismo studio. |
| Revocar platform owner | `platform_owner`, bloqueando ultimo owner activo. |
| Revocar studio owner | `platform_owner`. |
| Revocar studio manager | `platform_owner` o `studio_owner` del mismo studio. |
| Listar assignments globales | `platform_owner`. |
| Listar assignments scoped | `studio_owner` del studio o `studio_manager` si se decide permitir lectura. |

Frontend puede seguir usando permisos estaticos temporalmente, pero las RPC deben validar roles reales en DB.

## Auditoria `audit_events`

`entity_type` validos para esta fase:

- `user_role_assignment`
- `profile`
- `role`
- `studio`
- `audit_event`

Eventos recomendados:

| Evento | `entity_type` | `context` |
|---|---|---|
| `platform_owner_bootstrapped` | `user_role_assignment` | `identity` |
| `platform_owner_assigned` | `user_role_assignment` | `identity` |
| `studio_owner_assigned` | `user_role_assignment` | `studio` |
| `studio_manager_assigned` | `user_role_assignment` | `studio` |
| `admin_role_revoked` | `user_role_assignment` | `identity` |
| `default_role_recalculated` | `profile` | `identity` |

Cada evento debe incluir:

- `actor_profile_id`
- `entity_id`
- `studio_id` cuando aplique
- `before_data`
- `after_data`
- `metadata.reason`
- `metadata.actor_role`
- `metadata.target_profile_id`

Para bootstrap inicial, si no existe actor humano autenticado, usar metadata `source = 'system_bootstrap'` y definir explicitamente si `actor_profile_id` puede ser null o si se crea un profile tecnico.

## Flujo UI futuro

### Platform owner

Pantallas futuras:

- `Admin -> Platform -> Administradores`
- `Admin -> Studios -> Administradores`

Acciones:

- Invitar platform owner.
- Asignar studio owner.
- Revocar roles.
- Ver auditoria de asignaciones.

### Studio owner

Pantalla futura:

- `Admin -> Equipo`

Acciones:

- Invitar studio manager.
- Revocar studio manager.
- Ver managers activos del studio.

### Studio manager

Inicialmente no debe poder crear otros admins. Puede tener lectura limitada de equipo si se define permiso futuro.

## Secuencia recomendada de implementacion futura

### Oleada 1: Bootstrap seguro

- Definir mecanismo one-time para primer `platform_owner`.
- Crear helper para detectar ultimo `platform_owner`.
- Crear auditoria bootstrap.

### Oleada 2: Helpers de autorizacion

- `current_profile`
- `is_platform_owner`
- `can_manage_studio_roles`
- `recalculate_default_role`
- `write_audit_event`

### Oleada 3: RPC de asignacion/revocacion

- `studio_flow_admin_assign_role`
- `studio_flow_admin_revoke_role`
- wrappers `create_studio_owner` y `create_studio_manager`

### Oleada 4: Service layer

- `src/services/adminProvisioningService.js`
- Listado de assignments.
- Acciones con payload estable.

### Oleada 5: UI

- Pantalla de administradores.
- Modales de invitacion/asignacion.
- Modal de revocacion con motivo.
- Estado de carga/error.

### Oleada 6: Permisos efectivos

- Decidir si `permissions`/`role_permissions` pasan a ser autoridad real.
- Implementar `studio_flow_get_effective_permissions`.
- Migrar `hasPermission` si aplica.

## Riesgos

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Crear admins desde registro publico | Escalada de privilegios | No exponer roles admin en signup. |
| `default_role` sin assignment | Login parece admin pero RPC devuelve vacio | Provisioning debe crear assignment siempre. |
| Roles scoped sin `studio_id` | Admin sin datos o scope ambiguo | Rechazar asignacion incompleta. |
| Revocar ultimo `platform_owner` | Bloqueo administrativo total | Constraint logico en RPC. |
| Permisos JS y DB divergen | UI permite/oculta acciones incorrectas | Backend manda; frontend solo UX hasta migrar permisos efectivos. |
| Crear Auth users desde SQL cliente | Superficie insegura o imposible | Usar Edge Function/Admin API para invitaciones. |
| Multiples owners sin regla | Confusion operativa | Definir owner primario vs owners scoped. |

## Decisiones pendientes

1. Si habra uno o varios `platform_owner`.
2. Si `studios.owner_profile_id` sera owner primario obligatorio o campo informativo.
3. Si un usuario puede ser `studio_owner` en multiples studios.
4. Si `studio_manager` podra administrar otros managers o solo operar.
5. Si `permissions` DB reemplazara la matriz estatica JS.
6. Si el primer bootstrap se hara por SQL/manual, Edge Function o CLI seed.

## Veredicto

La base correcta para administradores reales es `user_role_assignments`, no `profiles.default_role` por si solo.

`profiles.default_role` debe seguir existiendo como preferencia de sesion, pero toda autorizacion administrativa debe salir de assignments activos, con `studio_id` obligatorio para roles scoped y auditoria en cada cambio.

Antes de implementar mas escrituras admin, Studio Flow necesita un provisioning controlado para crear el primer `platform_owner`, asignar `studio_owner`/`studio_manager` con scope real y revocar roles sin borrar historial.
