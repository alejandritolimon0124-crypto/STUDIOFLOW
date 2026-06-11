# FASE 16.2 - ADMIN ARTISTS WAVE B PLAN

## Objetivo

Planear la migracion de las acciones de escritura de Admin Artists a Supabase real mediante RPC `SECURITY DEFINER`.

Este documento no implementa codigo, no crea SQL, no crea RPCs y no modifica UI. Define auditoria actual, contratos esperados, tablas, validaciones, auditoria y orden recomendado.

## Alcance Wave B

Implementar en una fase posterior solo backend + service layer para:

1. Activar artista.
2. Suspender artista.
3. Aprobar artista.
4. Rechazar artista.
5. Actualizar perfil artista desde Admin.

No tocar UI significa que los botones y formularios actuales de `AdminArtists.jsx` deben mantenerse. Donde hoy no existe UI, las RPC quedaran preparadas para fases futuras y no se conectaran hasta que exista accion visual.

## Auditoria actual

### `toggleManagedArtistStatus`

| Punto | Resultado |
|---|---|
| UI | `src/pages/admin/AdminArtists.jsx:211` |
| Accion visual | Boton muestra `Inactivar` si `artist.status === 'Activo'`, si no muestra `Activar`. |
| Funcion UI | `toggleManagedArtistStatus(artist.id)` |
| AppContext | `src/contexts/AppContext.jsx:1042` |
| Servicio | Ninguno |
| Supabase | Ninguno |
| Tabla actual | Ninguna |
| Cadena actual | UI -> `toggleManagedArtistStatus` -> `setAdminState` -> `localStorage` -> FIN |
| Clasificacion | SOLO DEMO |

Comportamiento actual:

```text
Activo -> Inactivo
Inactivo -> Activo
```

No valida:

- `auth.uid()`
- rol administrativo real
- scope por studio
- estado de membership
- marketplace
- auditoria

### `updateManagedArtistProfile`

| Punto | Resultado |
|---|---|
| UI | `src/pages/admin/AdminArtists.jsx:122` |
| Accion visual | Modal `Editar perfil`, boton `Guardar cambios`. |
| Funcion UI | `saveArtistProfile()` local en `AdminArtists.jsx`. |
| AppContext | `updateManagedArtistProfile` en `src/contexts/AppContext.jsx:1053`. |
| Servicio | Ninguno |
| Supabase | Ninguno |
| Tabla actual | Ninguna |
| Cadena actual | UI -> draft state -> `saveArtistProfile` -> `updateManagedArtistProfile` -> `setAdminState` -> `localStorage` -> FIN |
| Clasificacion | SOLO DEMO |

Campos editados por la UI actual:

- `name`
- `city`
- `plan`
- `services`
- `description`
- `professionalLocation`

Adicionalmente, si hay studio asociado, `saveArtistProfile()` llama `updateManagedStudioProfile(editingStudio.id, { professionalLocation })`. Esa escritura tambien es local y debe quedar fuera de Wave B salvo que se decida crear una RPC separada de `studio_profiles`.

## Matriz UI -> funcion -> AppContext -> servicio -> tabla

| Accion | UI | Funcion | AppContext | Servicio actual | Tabla actual | Tabla esperada | Estado |
|---|---|---|---|---|---|---|---|
| Activar artista | `AdminArtists.jsx:211` | `toggleManagedArtistStatus` | `AppContext.jsx:1042` | Ninguno | Ninguna | `artists`, `artist_studio_memberships`, `audit_events` | SOLO DEMO |
| Desactivar actual | `AdminArtists.jsx:211` | `toggleManagedArtistStatus` | `AppContext.jsx:1042` | Ninguno | Ninguna | `artists`, `marketplace_profiles`, `audit_events` | SOLO DEMO |
| Suspender artista | No existe UI dedicada | Ninguna | Ninguno | Ninguno | Ninguna | `sanctions`, `risk_flags`, `artists`, `marketplace_profiles`, `audit_events` | SIN IMPLEMENTAR |
| Aprobar artista | No existe UI dedicada | Ninguna | Ninguno | Ninguno | Ninguna | `artists`, `artist_studio_memberships`, `artist_claim_reviews`, `audit_events` | SIN IMPLEMENTAR |
| Rechazar artista | No existe UI dedicada | Ninguna | Ninguno | Ninguno | Ninguna | `artist_claim_reviews`, `artist_studio_memberships`, `artists`, `audit_events` | SIN IMPLEMENTAR |
| Actualizar perfil artista | `AdminArtists.jsx:429` | `saveArtistProfile` | `updateManagedArtistProfile` | Ninguno | Ninguna | `artists`, `artist_profiles`, opcional `profiles`, `audit_events` | SOLO DEMO |

Nota: aunque el objetivo enumera "suspender", la UI actual solo alterna `Activo/Inactivo`. Como `artist_status` solo permite `active`, `inactive`, `archived`, suspender debe modelarse con `sanctions` y/o `marketplace_profiles.visibility_status = 'suspended'`, no con `artists.status = 'suspended'`.

## Service layer propuesto

Crear en fase de implementacion:

`src/services/adminArtistService.js`

Extender el service existente con funciones de escritura:

| Funcion service | RPC |
|---|---|
| `activateAdminArtist(artistId)` | `studio_flow_admin_activate_artist` |
| `suspendAdminArtist(artistId, reason)` | `studio_flow_admin_suspend_artist` |
| `approveAdminArtist(artistId, payload)` | `studio_flow_admin_approve_artist` |
| `rejectAdminArtist(artistId, reason)` | `studio_flow_admin_reject_artist` |
| `updateAdminArtistProfile(artistId, patch)` | `studio_flow_admin_update_artist_profile` |

Cada funcion debe devolver el mismo shape mapeado que `fetchAdminArtists()` ya entrega para mantener compatible `adminState.artists`.

## RPC 1: Activar artista

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_activate_artist` |
| Proposito | Cambiar artista a estado operativo activo. |
| Parametros | `p_artist_id uuid`, `p_membership_id uuid default null`, `p_reason text default null` |
| Tablas | `artists`, `artist_studio_memberships`, `marketplace_profiles` opcional, `audit_events` |
| Devuelve | Payload admin actualizado del artista o `{ artist: ..., memberships: ... }` compatible con mapper. |

Validaciones:

- `auth.uid()` no nulo.
- Actor profile activo.
- Actor tiene role assignment activo:
  - `platform_owner` global, o
  - `studio_owner`/`studio_manager` con `studio_id` relacionado al artista.
- Artista existe y no esta archivado.
- Si actor no es platform owner, el artista debe estar vinculado al `studio_id` del actor mediante `artist_studio_memberships`.
- Si `p_membership_id` se envia, debe pertenecer al artista y al studio scoped.

Mutacion esperada:

- `artists.status = 'active'`
- `artists.updated_at = now()`
- Si membership estaba inactiva y el negocio lo permite, `artist_studio_memberships.status = 'active'`
- No publicar marketplace automaticamente salvo decision explicita.

Auditoria:

| Campo | Valor |
|---|---|
| `entity_type` | `artist` |
| `event_type` | `artist_activated` |
| `context` | `identity` o `studio` |
| `before_data` | artista/membership antes |
| `after_data` | artista/membership despues |

Riesgo: el boton actual "Activar" no captura motivo ni membership. La primera conexion UI-compatible debe pasar solo `artistId` y dejar `reason = null`.

## RPC 2: Suspender artista

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_suspend_artist` |
| Proposito | Suspender operativamente al artista sin borrar ni archivar. |
| Parametros | `p_artist_id uuid`, `p_reason text`, `p_scope_studio_id uuid default null` |
| Tablas | `sanctions`, `risk_flags` opcional, `artists`, `marketplace_profiles`, `marketplace_listings`, `audit_events` |
| Devuelve | Artista actualizado y sancion creada. |

Validaciones:

- `auth.uid()` no nulo.
- Actor profile activo.
- `platform_owner` o rol scoped autorizado.
- Motivo requerido.
- Artista existe y no esta archivado.
- Scope por studio si actor no es platform owner.

Mutacion esperada:

- Crear `sanctions` con:
  - `subject_type = 'artist'`
  - `subject_id = p_artist_id`
  - `status = 'active'`
  - `reason = p_reason`
  - `created_by_profile_id = auth.uid()`
- Opcional: crear `risk_flags`.
- Opcional: ocultar/suspender marketplace:
  - `marketplace_profiles.visibility_status = 'suspended'`
- Decision pendiente: si tambien cambiar `artists.status = 'inactive'`.

Auditoria:

| Campo | Valor |
|---|---|
| `entity_type` | `sanction` o `artist` |
| `event_type` | `artist_suspended` o `sanction_applied` |
| `context` | `trust` |
| `metadata` | reason, scope_studio_id |

Riesgo: no existe UI actual para suspension ni motivo. No conectar esta RPC al toggle actual sin cambiar semantica visual.

## RPC 3: Aprobar artista

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_approve_artist` |
| Proposito | Aprobar artista o membership pendiente dentro de un studio. |
| Parametros | `p_artist_id uuid`, `p_membership_id uuid default null`, `p_studio_id uuid default null`, `p_reason text default null` |
| Tablas | `artists`, `artist_studio_memberships`, `artist_claim_reviews` si aplica, `user_role_assignments` opcional, `audit_events` |
| Devuelve | Artista, membership y estado aprobado. |

Validaciones:

- Actor autenticado y profile activo.
- `platform_owner` o admin scoped del studio.
- Si se envia `p_membership_id`, pertenece a `p_artist_id`.
- Si se envia `p_studio_id`, actor puede administrar ese studio.
- Artista no esta archivado.
- Membership no esta archivada.

Mutacion esperada:

- `artists.status = 'active'`
- `artist_studio_memberships.status = 'active'`
- Resolver claim/review pendiente si existe.
- No publicar marketplace automaticamente salvo decision futura.

Auditoria:

| Campo | Valor |
|---|---|
| `entity_type` | `artist` o `artist_studio_membership` |
| `event_type` | `artist_approved` |
| `context` | `studio` |
| `membership_id` | membership aprobada si existe |

Riesgo: Admin Artists no tiene UI de aprobacion/rechazo. Esta RPC debe quedar disponible para cuando exista una cola de pendientes o claim reviews.

## RPC 4: Rechazar artista

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_reject_artist` |
| Proposito | Rechazar solicitud/membership pendiente sin borrar artista. |
| Parametros | `p_artist_id uuid`, `p_membership_id uuid default null`, `p_reason text` |
| Tablas | `artist_studio_memberships`, `artist_claim_reviews`, `governance_reviews` opcional, `artists`, `audit_events` |
| Devuelve | Estado actualizado de artista/membership/review. |

Validaciones:

- Actor autenticado y profile activo.
- Actor tiene scope sobre el studio/membership.
- Motivo requerido.
- No rechazar memberships activas sin flujo de revocacion/desactivacion separado.

Mutacion esperada:

- Si hay review/claim: marcar como `rejected` o equivalente.
- Si hay membership pendiente: marcar como `archived` o estado no activo segun enum real.
- Mantener `artists` sin borrar.

Auditoria:

| Campo | Valor |
|---|---|
| `entity_type` | `artist` o `artist_studio_membership` |
| `event_type` | `artist_rejected` |
| `context` | `studio` |
| `metadata` | reason, claim_review_id si aplica |

Riesgo: `audit_events_entity_type_check` no permite `artist_claim_review`; auditar claims bajo `artist` o `artist_studio_membership`, o ajustar constraints en otra fase explicita.

## RPC 5: Actualizar perfil artista desde Admin

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_admin_update_artist_profile` |
| Proposito | Persistir cambios del modal actual `Editar perfil`. |
| Parametros | `p_artist_id uuid`, `p_patch jsonb`, `p_reason text default null` |
| Tablas | `artists`, `artist_profiles`, opcional `profiles`, `audit_events` |
| Devuelve | Artista actualizado en shape compatible con `mapAdminArtistsPayload`. |

Validaciones:

- `auth.uid()` no nulo.
- Actor profile activo.
- `platform_owner` o admin scoped del studio del artista.
- Artista existe y no esta archivado.
- Patch con allowlist estricta.
- No permitir cambiar `artist.profile_id`, ownership, membership ni roles desde esta RPC.

Allowlist propuesta:

| Campo UI | Tabla/columna |
|---|---|
| `name` | `artists.display_name` y `artist_profiles.artistic_name` |
| `city` | `artist_profiles.city` |
| `services` | `artist_profiles.specialties` o `primary_specialty` |
| `description` | `artist_profiles.bio` |
| `professionalLocation.useStudioLocation` | `artist_profiles.use_studio_location` |
| `professionalLocation.customLocation.address` | `artist_profiles.address_line` |
| `professionalLocation.customLocation.city` | `artist_profiles.city` |
| `professionalLocation.customLocation.latitude` | `artist_profiles.latitude` |
| `professionalLocation.customLocation.longitude` | `artist_profiles.longitude` |

No incluir en esta RPC:

- `plan`, porque hoy viene de `artist_studio_memberships.role`.
- ubicacion del studio, porque pertenece a `studio_profiles`.
- `status`, porque tiene RPCs dedicadas.
- `email` y telefono de `profiles`, salvo que se defina un flujo admin separado de identidad.

Auditoria:

| Campo | Valor |
|---|---|
| `entity_type` | `artist_profile` |
| `event_type` | `admin_artist_profile_updated` |
| `context` | `identity` o `studio` |
| `before_data` | artist + artist_profile antes |
| `after_data` | artist + artist_profile despues |

Riesgo: la UI actual tambien actualiza ubicacion de studio via `updateManagedStudioProfile`. Para no tocar UI, Wave B puede ignorar esa parte o planear `studio_flow_admin_update_studio_profile_location` como RPC posterior. Si se deja local, habra inconsistencia: artista persistido en Supabase, studio location no.

## Helper backend requerido

| Helper | Uso |
|---|---|
| `studio_flow_admin_current_profile()` | Validar `auth.uid()` y `profiles.status = active`. |
| `studio_flow_admin_is_platform_owner()` | Acceso global. |
| `studio_flow_admin_scoped_studio_ids()` | Resolver studios permitidos por `user_role_assignments`. |
| `studio_flow_admin_can_manage_artist(p_artist_id)` | Validar platform/global o membership dentro de studio scoped. |
| `studio_flow_admin_artist_payload(p_artist_id)` | Devolver shape compatible con Admin Artists. |
| `studio_flow_write_audit_event(...)` | Centralizar auditoria y evitar errores de constraints. |

## Dependencias RLS

Las RPC son `SECURITY DEFINER`, por lo que deben hacer sus propias validaciones. RLS futura debe asumir:

| Tabla | Politica esperada |
|---|---|
| `artists` | Lectura scoped por admin; escrituras solo RPC. |
| `artist_profiles` | Lectura scoped; escrituras admin solo RPC. |
| `artist_studio_memberships` | Lectura scoped; mutaciones solo RPC. |
| `sanctions` | Lectura/escritura solo platform/trust RPC. |
| `risk_flags` | Lectura/escritura solo platform/trust RPC. |
| `marketplace_profiles` | Public read visible; admin writes solo RPC. |
| `audit_events` | Insert solo RPC/helper; lectura admin scoped. |

## Dependencias `audit_events`

Usar solo `entity_type` permitidos:

- `artist`
- `artist_profile`
- `artist_studio_membership`
- `sanction`
- `risk_flag`
- `marketplace_profile`

No usar:

- `artists`
- `artist_profiles`
- `artist_claim_review`
- `artist_claim_invitation`

Eventos recomendados:

| Accion | `entity_type` | `event_type` | `context` |
|---|---|---|---|
| Activar | `artist` | `artist_activated` | `identity` o `studio` |
| Suspender | `sanction` | `artist_suspended` | `trust` |
| Aprobar | `artist_studio_membership` | `artist_approved` | `studio` |
| Rechazar | `artist_studio_membership` | `artist_rejected` | `studio` |
| Actualizar perfil | `artist_profile` | `admin_artist_profile_updated` | `identity` o `studio` |

## Compatibilidad con UI actual

Para no tocar UI, AppContext puede mantener los mismos nombres:

| Funcion actual | Nueva implementacion futura |
|---|---|
| `toggleManagedArtistStatus(artistId)` | Si artista esta `Activo`, llamar desactivar/inactivar; si no, llamar activar. |
| `updateManagedArtistProfile(artistId, updates)` | Llamar `updateAdminArtistProfile(artistId, updates)`. |

Brecha: el objetivo pide suspender, pero el toggle actual dice `Inactivar`, no `Suspender`. Recomendacion:

- Wave B UI-compatible: implementar `studio_flow_admin_deactivate_artist` aunque no este en la lista, o mapear "Inactivar" a `artists.status = 'inactive'`.
- Mantener `studio_flow_admin_suspend_artist` disponible pero sin conectarla al boton actual hasta que exista UI con motivo.

## Orden recomendado de implementacion

### Paso 1: payload compartido

- Crear helper/RPC interno que devuelva un artista con el mismo shape que `studio_flow_admin_get_artists`.
- Evitar duplicar mapper SQL por cada RPC.

### Paso 2: activar/inactivar compatible con UI actual

- Implementar `studio_flow_admin_activate_artist`.
- Implementar adicional recomendado `studio_flow_admin_deactivate_artist` para el boton `Inactivar`.
- Migrar `toggleManagedArtistStatus` en service layer sin tocar `AdminArtists.jsx`.

### Paso 3: actualizar perfil

- Implementar `studio_flow_admin_update_artist_profile`.
- Migrar `updateManagedArtistProfile` a service layer.
- Decidir que hacer con `updateManagedStudioProfile`: dejar local temporalmente o crear Wave B.1.

### Paso 4: aprobacion/rechazo

- Implementar `studio_flow_admin_approve_artist`.
- Implementar `studio_flow_admin_reject_artist`.
- Mantener sin conectar a UI hasta que haya lista de pendientes.

### Paso 5: suspension real

- Implementar `studio_flow_admin_suspend_artist`.
- Requiere motivo obligatorio y decision de impacto en marketplace.
- No conectar al toggle actual.

## Riesgos principales

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Confundir inactivar con suspender | Sanciones sin motivo o estado incorrecto | Mantener RPCs separadas. |
| `artist_status` no tiene `suspended` | Error SQL si se intenta guardar ese estado | Usar `sanctions`/`marketplace_profiles`, no enum inexistente. |
| UI no captura motivo | Auditoria incompleta para rechazo/suspension | No conectar esas RPC hasta agregar modal futuro. |
| Studio location sigue local | Perfil parece guardado parcialmente | Crear Wave B.1 para `studio_profiles` o documentar limitacion temporal. |
| Admin scoped sin `studio_id` | RPC devuelve permiso denegado | Requiere provisioning admin previo correcto. |
| `audit_events` con entity_type plural | Falla check constraint | Usar singular permitido. |

## Veredicto

Admin Artists Wave B debe empezar por acciones que la UI ya puede expresar sin cambios: activar/inactivar y editar perfil de artista.

Aprobacion, rechazo y suspension deben disenarse como RPCs reales, pero no conectarse todavia a la UI porque hoy no existen controles, motivo obligatorio ni cola de pendientes. La regla central es que todas las escrituras deben pasar por RPC `SECURITY DEFINER`, validar role assignment scoped y devolver el artista actualizado en el mismo shape que Admin Artists ya consume.
