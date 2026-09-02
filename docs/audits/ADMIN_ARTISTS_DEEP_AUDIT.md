# FASE 16.0 - ADMIN ARTISTS DEEP AUDIT

## Objetivo

Auditar completamente el modulo Admin Artists antes de implementar persistencia real sobre Supabase.

Este documento no modifica codigo, no crea RPCs, no crea SQL y no crea politicas. Solo identifica dependencias actuales, brechas, tablas esperadas, RPCs necesarias, dependencias RLS y dependencias `audit_events`.

## Fuentes auditadas

| Fuente | Hallazgo |
|---|---|
| `src/pages/admin/AdminArtists.jsx` | Pantalla principal Admin Artists. Tiene acciones de activar/inactivar, editar perfil y ver dashboard. No usa Supabase ni service layer. |
| `src/contexts/AppContext.jsx` | `toggleManagedArtistStatus`, `updateManagedArtistProfile` y `updateManagedStudioProfile` solo hacen `setAdminState`. |
| `src/services/mockData.js` | `managedArtists` es la fuente inicial demo. Incluye `status` y `studioStatus`, pero no acciones reales de aprobacion/rechazo. |
| `src/routes/ProtectedRoute.jsx` | `/admin` permite `platform_owner`, `studio_owner` y `studio_manager`. |
| `src/layouts/AdminLayout.jsx` / `DashboardLayout.jsx` | La navegacion de Artistas depende de `permissions.STUDIO_ARTISTS`. |
| `supabase/migrations` | Existen tablas base para artists, memberships, marketplace, trust y audit, pero no RPC admin para estos flujos. |

## Veredicto ejecutivo

Admin Artists hoy es un modulo demo/local para la mayoria de acciones. No hay CRUD directo a Supabase desde la pantalla y no hay service layer administrativo conectado.

La cadena real dominante es:

`UI -> AppContext -> setAdminState -> localStorage -> FIN`

No existe actualmente:

- aprobacion real de artista
- rechazo real de artista
- suspension real de artista
- publicacion/ocultamiento marketplace desde Admin Artists
- persistencia Supabase para editar perfil desde Admin Artists
- auditoria real de acciones administrativas de artistas

## Estado por accion

| Accion | Clasificacion | Cadena actual | Persistencia actual |
|---|---|---|---|
| Aprobacion de artista | SIN IMPLEMENTAR | No hay UI/handler especifico | Ninguna |
| Rechazo de artista | SIN IMPLEMENTAR | No hay UI/handler especifico | Ninguna |
| Activacion | SOLO DEMO | UI -> `toggleManagedArtistStatus` -> `setAdminState` -> localStorage | Local |
| Desactivacion | SOLO DEMO | UI -> `toggleManagedArtistStatus` -> `setAdminState` -> localStorage | Local |
| Suspension | SIN IMPLEMENTAR | No hay UI/handler especifico | Ninguna |
| Edicion de perfil | SOLO DEMO | UI -> `saveArtistProfile` -> `updateManagedArtistProfile`/`updateManagedStudioProfile` -> `setAdminState` -> localStorage | Local |
| Visibilidad marketplace | SIN IMPLEMENTAR | No hay UI/handler especifico | Ninguna |

## Trazabilidad actual

### Acceso a pantalla

| Punto | Archivo | Detalle |
|---|---|---|
| Ruta admin | `src/App.jsx:59` | `/admin` usa `ProtectedRoute allowedRole="admin"`. |
| Ruta artists | `src/App.jsx:61` | `admin/artists` renderiza `AdminArtists`. |
| Roles permitidos | `src/routes/ProtectedRoute.jsx:6` | `admin` acepta `platform_owner`, `studio_owner`, `studio_manager`. |
| Permiso de menu | `src/layouts/AdminLayout.jsx:19` | `canSeeArtists = hasPermission(session.user, permissions.STUDIO_ARTISTS)`. |
| Permiso de nav mobile/desktop | `src/layouts/DashboardLayout.jsx:104` | Muestra Artistas si tiene `STUDIO_ARTISTS`. |

Nota: `studio_manager` puede entrar a `/admin`, pero `permissionsByRole` no incluye `STUDIO_ARTISTS` para ese rol. Puede llegar al layout admin segun ruta, pero la navegacion puede ocultar Artistas.

### Fuente de datos actual

| Punto | Archivo | Detalle |
|---|---|---|
| Estado inicial admin | `src/contexts/AppContext.jsx` | `createInitialAdminState()` parte de `managedArtists`, `studios`, `managedClients` y otros mocks. |
| Recuperacion local | `src/contexts/AppContext.jsx:369` | `getStoredAdminState()` lee `localStorage` key `studio-flow-admin-state`. |
| Persistencia local | `src/contexts/AppContext.jsx:845` | Un `useEffect` guarda `adminState` en `localStorage`. |
| Mock artists | `src/services/mockData.js:427` | `managedArtists` contiene `status: 'Activo'/'Inactivo'` y `studioStatus: 'approved'/'pending'/'suspended'`. |

## Auditoria por accion

### 1. Aprobacion de artista

| Campo | Resultado |
|---|---|
| Clasificacion | SIN IMPLEMENTAR |
| UI actual | No existe boton ni flujo explicito de aprobar artista en `AdminArtists.jsx`. |
| Funcion actual | Ninguna. |
| Contexto actual | Ninguno. |
| Servicio actual | Ninguno. |
| Supabase actual | Ninguno. |
| Cadena actual | UI inexistente -> FIN |
| Tablas usadas actualmente | Ninguna. Solo datos mock con `studioStatus: 'pending'/'approved'`. |
| Tablas que deberian usarse | `artists`, `artist_profiles`, `artist_studio_memberships`, `user_role_assignments`, `artist_claim_reviews`, `artist_claim_invitations`, `marketplace_profiles`, opcional `governance_reviews`, `audit_events`. |
| RPC necesaria | `studio_flow_admin_approve_artist` o `studio_flow_admin_resolve_artist_claim_review`. |
| Dependencias RLS | `is_platform_owner`, `can_access_studio`, `can_manage_membership`, `has_role('studio_owner'/'studio_manager')` con permiso efectivo `studio_artists`. |
| Dependencias audit_events | Insertar `entity_type = 'artist'` o `artist_studio_membership`; `context = 'identity'` o `studio`; `event_type = 'artist_approved'`. |

Riesgo especial: `audit_events_entity_type_check` permite `artist`, `artist_profile`, `artist_studio_membership`, pero no permite `artist_claim_invitation` ni `artist_claim_review`. Si se auditan claims con esos valores, fallara el CHECK salvo que se cambie la allowlist o se audite bajo `entity_type = 'artist'`.

### 2. Rechazo de artista

| Campo | Resultado |
|---|---|
| Clasificacion | SIN IMPLEMENTAR |
| UI actual | No existe boton ni flujo explicito de rechazar artista. |
| Funcion actual | Ninguna. |
| Contexto actual | Ninguno. |
| Servicio actual | Ninguno. |
| Supabase actual | Ninguno. |
| Cadena actual | UI inexistente -> FIN |
| Tablas usadas actualmente | Ninguna. |
| Tablas que deberian usarse | `artist_claim_reviews`, `artist_claim_invitations`, `artists`, `artist_studio_memberships`, `governance_reviews`, `audit_events`. |
| RPC necesaria | `studio_flow_admin_reject_artist` o `studio_flow_admin_resolve_artist_claim_review`. |
| Dependencias RLS | Platform owner global o studio owner/manager scoped al `studio_id` de la solicitud. |
| Dependencias audit_events | `entity_type = 'artist'`; `event_type = 'artist_rejected'`; incluir metadata con `reason`, `claim_review_id` y `membership_id` si aplica. |

### 3. Activacion

| Campo | Resultado |
|---|---|
| Clasificacion | SOLO DEMO |
| UI actual | Boton `Activar` en `src/pages/admin/AdminArtists.jsx:211`. |
| Funcion UI | `toggleManagedArtistStatus(artist.id)`. |
| Contexto | `src/contexts/AppContext.jsx:1007`. |
| Servicio | Ninguno. |
| Supabase | Ninguno. |
| Cadena actual | UI -> `toggleManagedArtistStatus` -> `setAdminState` -> `localStorage` -> FIN |
| Tablas usadas actualmente | Ninguna. |
| Tablas que deberian usarse | `artists`, `artist_studio_memberships`, `profiles`, `user_role_assignments`, opcional `marketplace_profiles`, `audit_events`. |
| RPC necesaria | `studio_flow_admin_activate_artist` o `studio_flow_admin_update_artist_status`. |
| Dependencias RLS | Platform owner puede activar globalmente; studio owner solo artistas/memberships de su studio; manager solo si permiso efectivo lo permite. |
| Dependencias audit_events | `entity_type = 'artist'`; `event_type = 'artist_activated'`; `before_data` y `after_data` obligatorios. |

Observacion: el modelo real `artist_status` solo permite `active`, `inactive`, `archived`. Activar debe mapear `Activo` UI -> `active` DB.

### 4. Desactivacion

| Campo | Resultado |
|---|---|
| Clasificacion | SOLO DEMO |
| UI actual | Boton `Inactivar` en `src/pages/admin/AdminArtists.jsx:211`. |
| Funcion UI | `toggleManagedArtistStatus(artist.id)`. |
| Contexto | `src/contexts/AppContext.jsx:1007`. |
| Servicio | Ninguno. |
| Supabase | Ninguno. |
| Cadena actual | UI -> `toggleManagedArtistStatus` -> `setAdminState` -> `localStorage` -> FIN |
| Tablas usadas actualmente | Ninguna. |
| Tablas que deberian usarse | `artists`, `artist_studio_memberships`, `marketplace_profiles`, `marketplace_listings`, `availability_slots`, `audit_events`. |
| RPC necesaria | `studio_flow_admin_deactivate_artist` o `studio_flow_admin_update_artist_status`. |
| Dependencias RLS | Misma que activacion, con validacion de scope por studio/membership. |
| Dependencias audit_events | `entity_type = 'artist'`; `event_type = 'artist_deactivated'`; registrar impacto en marketplace si se oculta. |

Decision pendiente: desactivar artista deberia o no ocultar marketplace y disponibilidad. Si afecta marketplace, la RPC debe actualizar `marketplace_profiles.visibility_status = 'hidden'` o dejar una accion separada.

### 5. Suspension

| Campo | Resultado |
|---|---|
| Clasificacion | SIN IMPLEMENTAR |
| UI actual | No existe boton `Suspender` ni estado `Suspendido` en Admin Artists. |
| Funcion actual | Ninguna. |
| Contexto actual | Ninguno. |
| Servicio actual | Ninguno. |
| Supabase actual | Ninguno. |
| Cadena actual | UI inexistente -> FIN |
| Tablas usadas actualmente | Ninguna. |
| Tablas que deberian usarse | `sanctions`, `risk_flags`, `artists`, `marketplace_profiles`, `marketplace_listings`, `availability_slots`, `governance_reviews`, `audit_events`. |
| RPC necesaria | `studio_flow_admin_suspend_artist`. |
| Dependencias RLS | Platform owner o governance/risk role. Studio owner solo si la suspension scoped esta permitida por negocio. |
| Dependencias audit_events | `entity_type = 'sanction'` y/o `artist`; `context = 'trust'`; `event_type = 'artist_suspended'` o `sanction_applied`. |

Riesgo de modelo: `artist_status` no tiene valor `suspended`. La suspension debe modelarse con `sanctions`/`risk_flags` y posiblemente `artists.status = 'inactive'`, o requiere una migracion de enum antes de implementar.

### 6. Edicion de perfil

| Campo | Resultado |
|---|---|
| Clasificacion | SOLO DEMO |
| UI actual | Boton `Editar perfil` en `src/pages/admin/AdminArtists.jsx:215`. |
| Funcion UI | `setEditingArtist(artist)` y luego `saveArtistProfile()` en `src/pages/admin/AdminArtists.jsx:122`. |
| Contexto | `updateManagedArtistProfile` en `src/contexts/AppContext.jsx:1018`; `updateManagedStudioProfile` en `src/contexts/AppContext.jsx:1027`. |
| Servicio | Ninguno. |
| Supabase | Ninguno. |
| Cadena actual | UI -> local draft state -> `saveArtistProfile` -> `updateManagedArtistProfile`/`updateManagedStudioProfile` -> `setAdminState` -> `localStorage` -> FIN |
| Tablas usadas actualmente | Ninguna. |
| Tablas que deberian usarse | `artists`, `artist_profiles`, `profiles` si edita identidad/contacto, `studio_profiles` si edita ubicacion de studio, `audit_events`. |
| RPC necesaria | `studio_flow_admin_save_artist_profile`; si toca estudio, `studio_flow_admin_save_studio_profile`. |
| Dependencias RLS | Platform owner global; studio owner/manager solo sobre artists vinculados a su `artist_studio_memberships`. |
| Dependencias audit_events | `entity_type = 'artist_profile'` para perfil profesional; `entity_type = 'studio_profile'` para ubicacion de studio; `before_data`/`after_data`. |

Riesgo de compatibilidad: Admin Artists edita campos mock (`name`, `city`, `plan`, `services`, `description`, `professionalLocation`) que no mapean 1:1 con `artist_profiles`. La RPC debe definir allowlist y mapper admin antes de persistir.

### 7. Visibilidad marketplace

| Campo | Resultado |
|---|---|
| Clasificacion | SIN IMPLEMENTAR |
| UI actual | No existe control visible para publicar, ocultar o suspender marketplace. |
| Funcion actual | Ninguna. |
| Contexto actual | Ninguno. |
| Servicio actual | Ninguno. |
| Supabase actual | Ninguno. |
| Cadena actual | UI inexistente -> FIN |
| Tablas usadas actualmente | Ninguna. |
| Tablas que deberian usarse | `marketplace_profiles`, `marketplace_listings`, `artists`, `artist_profiles`, `service_offerings`, opcional `availability_slots`, `audit_events`. |
| RPC necesaria | `studio_flow_admin_publish_artist_marketplace_profile`, `studio_flow_admin_hide_artist_marketplace_profile`, `studio_flow_admin_suspend_artist_marketplace_profile`, `studio_flow_refresh_marketplace_listing`. |
| Dependencias RLS | Public read solo `visible`; writes solo RPC con `can_manage_marketplace` y scope de artist/studio. |
| Dependencias audit_events | `entity_type = 'marketplace_profile'` o `marketplace_listing`; `context = 'marketplace'`; eventos `artist_marketplace_published`, `artist_marketplace_hidden`, `artist_marketplace_suspended`. |

## Matriz principal

| Accion | Archivo exacto | Funcion actual | Tabla actual | Tabla esperada | RPC necesaria | RLS | audit_events | Estado |
|---|---|---|---|---|---|---|---|---|
| Aprobar artista | No existe en UI | Ninguna | Ninguna | `artists`, `artist_studio_memberships`, `artist_claim_reviews`, `user_role_assignments` | `studio_flow_admin_approve_artist` | `is_platform_owner`/`can_access_studio`/`can_manage_membership` | `artist_approved` sobre `artist` | SIN IMPLEMENTAR |
| Rechazar artista | No existe en UI | Ninguna | Ninguna | `artist_claim_reviews`, `artist_claim_invitations`, `artists`, `governance_reviews` | `studio_flow_admin_reject_artist` | Platform o studio scoped | `artist_rejected` sobre `artist` | SIN IMPLEMENTAR |
| Activar artista | `src/pages/admin/AdminArtists.jsx:211` | `toggleManagedArtistStatus` | Ninguna | `artists`, `artist_studio_memberships` | `studio_flow_admin_activate_artist` | Platform o studio scoped | `artist_activated` sobre `artist` | SOLO DEMO |
| Desactivar artista | `src/pages/admin/AdminArtists.jsx:211` | `toggleManagedArtistStatus` | Ninguna | `artists`, `marketplace_profiles`, `marketplace_listings` | `studio_flow_admin_deactivate_artist` | Platform o studio scoped | `artist_deactivated` sobre `artist` | SOLO DEMO |
| Suspender artista | No existe en UI | Ninguna | Ninguna | `sanctions`, `risk_flags`, `artists`, `marketplace_profiles` | `studio_flow_admin_suspend_artist` | Platform/governance; studio scoped si se permite | `sanction_applied`/`artist_suspended` | SIN IMPLEMENTAR |
| Editar perfil | `src/pages/admin/AdminArtists.jsx:215`, `:429` | `saveArtistProfile` | Ninguna | `artists`, `artist_profiles`, `studio_profiles` | `studio_flow_admin_save_artist_profile` | Platform o studio scoped | `artist_profile_updated` | SOLO DEMO |
| Visibilidad marketplace | No existe en UI | Ninguna | Ninguna | `marketplace_profiles`, `marketplace_listings` | `studio_flow_admin_publish_artist_marketplace_profile` / hide / suspend | `can_manage_marketplace` | `artist_marketplace_published/hidden/suspended` | SIN IMPLEMENTAR |

## Supabase actual vs esperado

### Supabase actual

Admin Artists no ejecuta:

- `supabase.from(...)`
- `supabase.rpc(...)`
- service layer administrativo
- RPC `SECURITY DEFINER`

Las mutaciones actuales viven en:

| Funcion | Archivo | Efecto |
|---|---|---|
| `toggleManagedArtistStatus` | `src/contexts/AppContext.jsx:1007` | Alterna `Activo`/`Inactivo` en `adminState.artists`. |
| `updateManagedArtistProfile` | `src/contexts/AppContext.jsx:1018` | Fusiona `updates` en artista mock. |
| `updateManagedStudioProfile` | `src/contexts/AppContext.jsx:1027` | Fusiona `updates` en studio mock. |

### Supabase esperado

| Dominio | Tablas |
|---|---|
| Identidad | `profiles`, `artists`, `artist_profiles` |
| Multi-tenant | `studios`, `studio_profiles`, `artist_studio_memberships`, `user_role_assignments` |
| Claim/aprobacion | `artist_claim_invitations`, `artist_claim_reviews`, `governance_reviews` |
| Marketplace | `marketplace_profiles`, `marketplace_listings`, `service_offerings` |
| Trust/suspension | `sanctions`, `risk_flags` |
| Auditoria | `audit_events` |

## RPCs necesarias

| RPC | Acciones cubiertas | Responsabilidad |
|---|---|---|
| `studio_flow_admin_get_artists` | Listado Admin Artists | Devolver artistas scoped por rol, studio y permisos. |
| `studio_flow_admin_approve_artist` | Aprobacion | Resolver claim/membership, activar artist, asignar rol si aplica, auditar. |
| `studio_flow_admin_reject_artist` | Rechazo | Rechazar claim/review, guardar motivo, auditar. |
| `studio_flow_admin_activate_artist` | Activacion | Cambiar `artists.status` a `active`, reactivar membership si aplica, auditar. |
| `studio_flow_admin_deactivate_artist` | Desactivacion | Cambiar `artists.status` a `inactive`, decidir impacto en marketplace/disponibilidad, auditar. |
| `studio_flow_admin_suspend_artist` | Suspension | Crear `sanctions`/`risk_flags`, ocultar marketplace si aplica, auditar. |
| `studio_flow_admin_save_artist_profile` | Edicion de perfil | Actualizar allowlist de `artist_profiles` y `artists.display_name`. |
| `studio_flow_admin_save_studio_profile` | Edicion de ubicacion de studio desde panel | Actualizar `studio_profiles` scoped. |
| `studio_flow_admin_set_artist_marketplace_visibility` | Visibilidad marketplace | Publicar/ocultar/suspender `marketplace_profiles` y refrescar listings. |

## Dependencias RLS

| Helper conceptual | Uso en Admin Artists |
|---|---|
| `current_profile` | Resolver actor autenticado activo. |
| `is_platform_owner` | Permitir administracion global. |
| `can_access_studio` | Limitar studio owner/manager a studios asignados. |
| `can_access_artist` | Validar que el artista esta en scope del studio/rol. |
| `can_manage_membership` | Aprobar/rechazar/activar/desactivar memberships. |
| `can_manage_marketplace` | Cambiar visibilidad marketplace. |
| `write_audit_event` | Centralizar inserts a `audit_events`. |

RLS esperada por tabla:

| Tabla | Dependencia |
|---|---|
| `artists` | Read scoped por platform/studio; mutaciones solo RPC. |
| `artist_profiles` | Read scoped; admin writes solo RPC con allowlist. |
| `artist_studio_memberships` | Read scoped; writes solo RPC. |
| `user_role_assignments` | No direct write; role assignment/revoke por RPC. |
| `marketplace_profiles` | Public read solo visible; writes solo RPC. |
| `marketplace_listings` | Public read visible/no expirado; refresh por RPC/job. |
| `sanctions` | Platform/trust scoped; writes solo RPC. |
| `risk_flags` | Platform/trust scoped; writes solo RPC. |
| `audit_events` | Insert solo desde RPC/helper; read platform/scoped admin. |

## Dependencias audit_events

Constraint real relevante:

`audit_events_entity_type_check` permite, entre otros:

- `artist`
- `artist_profile`
- `artist_studio_membership`
- `studio_profile`
- `marketplace_profile`
- `marketplace_listing`
- `risk_flag`
- `sanction`
- `audit_event`

No permite:

- `artist_claim_invitation`
- `artist_claim_review`

Recomendacion para Admin Artists:

| Flujo | entity_type recomendado | context | event_type recomendado |
|---|---|---|---|
| Aprobar artista | `artist` | `identity` o `studio` | `artist_approved` |
| Rechazar artista | `artist` | `identity` o `studio` | `artist_rejected` |
| Activar artista | `artist` | `identity` | `artist_activated` |
| Desactivar artista | `artist` | `identity` | `artist_deactivated` |
| Suspender artista | `sanction` o `artist` | `trust` | `sanction_applied` o `artist_suspended` |
| Editar perfil | `artist_profile` | `identity` | `artist_profile_updated` |
| Publicar marketplace | `marketplace_profile` | `marketplace` | `artist_marketplace_published` |
| Ocultar marketplace | `marketplace_profile` | `marketplace` | `artist_marketplace_hidden` |

## Brechas criticas antes de implementar

1. Admin Artists no tiene service layer administrativo.
2. Las acciones existentes no son idempotentes ni transaccionales.
3. `toggleManagedArtistStatus` mezcla activar y desactivar en una sola accion sin motivo, permisos ni auditoria.
4. No hay modelo UI para rechazo, suspension o marketplace visibility.
5. `artist_status` no soporta `suspended`; suspension debe modelarse con `sanctions`/`risk_flags` o requiere cambio de enum.
6. Los campos mock de `managedArtists` no tienen mapper definido hacia `artists`/`artist_profiles`.
7. `audit_events_entity_type_check` no soporta entidades de claim, por lo que las RPC de aprobacion/rechazo deben auditar sobre `artist` o ajustar constraints en una fase explicita.

## Orden recomendado de implementacion futura

### Oleada A: lectura admin real

- Crear `studio_flow_admin_get_artists`.
- Reemplazar `adminState.artists` por payload RPC en service layer admin.
- Mantener mapper compatible con `AdminArtists.jsx`.

### Oleada B: status basico

- Separar UI handlers: activar y desactivar.
- Crear `studio_flow_admin_activate_artist`.
- Crear `studio_flow_admin_deactivate_artist`.
- Auditar con `entity_type = 'artist'`.

### Oleada C: edicion de perfil

- Crear `studio_flow_admin_save_artist_profile`.
- Definir mapper de campos mock/admin a columnas reales.
- Si se edita ubicacion de studio, moverlo a `studio_flow_admin_save_studio_profile`.

### Oleada D: aprobacion, rechazo y suspension

- Crear flujo de approvals basado en `artist_claim_reviews`/`artist_claim_invitations`.
- Crear `studio_flow_admin_approve_artist` y `studio_flow_admin_reject_artist`.
- Crear `studio_flow_admin_suspend_artist` usando `sanctions`/`risk_flags`.

### Oleada E: marketplace

- Crear `studio_flow_admin_set_artist_marketplace_visibility`.
- Actualizar `marketplace_profiles` y `marketplace_listings`.
- Alinear visibilidad con status/sanctions.

## Veredicto

Admin Artists no esta listo para RLS restrictivo ni para operaciones administrativas reales. La pantalla tiene buena estructura visual y filtros por rol/scope, pero las acciones son locales.

Antes de implementar cambios de seguridad en este modulo, hay que introducir una frontera de service layer admin y RPCs `SECURITY DEFINER` para lectura, status, perfil, aprobacion/rechazo, suspension y marketplace. La auditoria debe ser obligatoria desde el primer RPC porque estas acciones cambian identidad, visibilidad y acceso operacional del artista.
