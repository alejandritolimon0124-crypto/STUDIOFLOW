# FASE 16.2A - ADMIN ARTISTS CORE WRITE IMPLEMENTATION

## Objetivo

Implementar las acciones de escritura que ya existen en la UI actual de Admin Artists, sin modificar `AdminArtists.jsx`.

## Implementado

| Pieza | Resultado |
|---|---|
| Migracion SQL | `supabase/migrations/202606110007_admin_artists_core_write.sql` |
| RPC activar | `studio_flow_admin_activate_artist` |
| RPC desactivar | `studio_flow_admin_deactivate_artist` |
| RPC actualizar perfil | `studio_flow_admin_update_artist_profile` |
| Helper payload | `studio_flow_admin_artist_payload` |
| Helper scope | `studio_flow_admin_assert_can_manage_artist` |
| Service layer | `src/services/adminArtistService.js` extendido con escrituras RPC |
| AppContext | `toggleManagedArtistStatus` y `updateManagedArtistProfile` migradas a RPC para sesiones reales |
| UI | Sin cambios |

## Auditoria previa

| Accion UI | Antes | Ahora |
|---|---|---|
| Activar/Inactivar | `AdminArtists.jsx` -> `toggleManagedArtistStatus` -> `setAdminState` -> localStorage | `AdminArtists.jsx` -> `toggleManagedArtistStatus` -> RPC real -> `adminState` |
| Guardar perfil | `AdminArtists.jsx` -> `updateManagedArtistProfile` -> `setAdminState` -> localStorage | `AdminArtists.jsx` -> `updateManagedArtistProfile` -> RPC real -> `adminState` |

Las sesiones mock conservan el comportamiento local anterior.

## RPCs

### `studio_flow_admin_activate_artist`

- Valida `auth.uid()`.
- Valida profile activo.
- Valida assignment activo `platform_owner`, `studio_owner` o `studio_manager`.
- Valida scope por `artist_studio_memberships` para admins scoped.
- Cambia `artists.status` a `active`.
- Reactiva la membership scoped si aplica.
- Escribe `audit_events` con `entity_type = 'artist'`.
- Devuelve payload compatible con `studio_flow_admin_get_artists`.

### `studio_flow_admin_deactivate_artist`

- Valida las mismas reglas de scope.
- Cambia `artists.status` a `inactive`.
- Inactiva la membership scoped si aplica.
- Escribe `audit_events` con `entity_type = 'artist'`.
- Devuelve payload compatible.

### `studio_flow_admin_update_artist_profile`

- Valida actor y scope admin.
- Actualiza allowlist:
  - `artists.display_name`
  - `artist_profiles.artistic_name`
  - `artist_profiles.bio`
  - `artist_profiles.specialties`
  - `artist_profiles.primary_specialty`
  - campos de ubicacion profesional del artista
- No cambia roles, ownership, `profile_id`, email ni telefono.
- Escribe `audit_events` con `entity_type = 'artist_profile'`.
- Devuelve payload compatible.

## Service layer

Se agregaron:

- `activateAdminArtist(artistId)`
- `deactivateAdminArtist(artistId)`
- `updateAdminArtistProfile(artistId, patch)`

Cada funcion llama RPC y reutiliza `mapAdminArtistsPayload` para devolver el mismo shape que consume Admin Artists.

## AppContext

`toggleManagedArtistStatus(artistId)`:

- En sesion mock: mantiene toggle local.
- En sesion real:
  - si estado actual es `Activo`, llama `deactivateAdminArtist`.
  - si no, llama `activateAdminArtist`.
  - reemplaza el artista actualizado en `adminState.artists`.

`updateManagedArtistProfile(artistId, updates)`:

- En sesion mock: mantiene merge local.
- En sesion real:
  - llama `updateAdminArtistProfile`.
  - reemplaza el artista actualizado en `adminState.artists`.

## No implementado por diseno

- Aprobar artista.
- Rechazar artista.
- Suspender artista.
- UI nueva.
- Cambios de marketplace.
- Cambios persistentes de `studio_profiles` desde el modal.

## Dependencias de seguridad

| Requisito | Implementacion |
|---|---|
| `auth.uid()` | Validado en helper SQL. |
| Profile activo | `profiles.status = 'active'`. |
| Role assignment admin | `user_role_assignments` + `roles`. |
| Scope studio | Membership del artista dentro de studio asignado. |
| Auditoria | `audit_events` por cada mutacion. |
| Payload compatible | Helper SQL devuelve arrays `artists`, `artist_profiles`, `profiles`, `memberships`, `studios`. |

## Notas

- `artist_status` no tiene `suspended`; por eso esta fase implementa `deactivate`, no suspension.
- `entity_type` usa valores singulares permitidos por `audit_events_entity_type_check`.
- `AdminArtists.jsx` permanece sin cambios.

## Validacion

- `npm run build` ejecutado correctamente.
- Vite compilo 134 modulos.
- Se mantiene advertencia existente de chunk mayor a 500 kB.
