# FASE 17.8 - ARTIST APPROVAL & GOVERNANCE AUDIT

## Objetivo

Determinar si existe un sistema real de aprobacion, suspension y publicacion de artistas, y explicar por que Dennis Beauty Studio muestra:

```text
En validacion
```

mientras Marketplace muestra:

```text
No hay perfiles publicados
```

Este documento no implementa codigo, no crea SQL/RPC y no modifica flujos. Solo auditoria.

## Veredicto ejecutivo

No existe actualmente un sistema completo de aprobacion/publicacion de artistas.

Lo que existe es una mezcla de tres conceptos distintos:

| Concepto | Estado actual |
|---|---|
| Validacion de studio | Existe como estado de datos y UI, pero el write path real de aprobacion no esta conectado. |
| Activar/inactivar artista | Existe y si tiene RPC real. No equivale a aprobar/publicar. |
| Publicar en Marketplace | Existe infraestructura de tablas y lectura, pero no existe flujo UI/RPC para crear/publicar listings. |

La etiqueta `En validacion` no viene de una columna de artista. Viene de:

```text
studios.studio_status = pending
  -> getStudioStatusLabel('pending')
  -> 'En validacion'
```

El Marketplace real de Fase 17.7 exige:

```text
marketplace_listings.visibility_status = visible
marketplace_profiles.visibility_status = visible
artist.status = active
service_offerings.status = active
```

Si `marketplace_listings = 0`, el resultado correcto es:

```text
No hay perfiles publicados
```

## 1. Frontend

### Texto `En validacion`

Archivo:

`src/modules/governance/studioGovernance.js`

| Linea | Hallazgo |
|---:|---|
| `1-6` | Define `STUDIO_STATUS`: `pending`, `approved`, `suspended`, `rejected`. |
| `8-13` | Mapea `pending` a `En validacion`. |
| `31-33` | `isStudioApproved()` solo considera aprobado si `studioStatus === 'approved'`. |
| `35-46` | Si no esta aprobado, `publicAgenda`, `marketing`, `economy` y `automations` quedan bloqueados. |

El texto exacto sale de:

```js
studioStatusLabels[STUDIO_STATUS.PENDING] = 'En validacion'
```

### Componente que lo muestra

Archivo:

`src/layouts/ArtistLayout.jsx`

| Linea | Hallazgo |
|---:|---|
| `24` | Consume `adminState` y `session`. |
| `44-52` | Calcula `currentStudio` desde `adminState.studios` y memberships legacy. |
| `53-54` | `studioAccess = getStudioAccess(currentStudio)`, `isPendingExperience = !studioAccess.publicAgenda`. |
| `61-70` | Muestra banner de validacion y `StatusPill` con `getStudioStatusLabel(currentStudio?.studioStatus)`. |

Condicion exacta del banner:

```js
const isPendingExperience = !studioAccess.publicAgenda
```

Como `publicAgenda` solo es true cuando el studio esta aprobado, cualquier studio `pending`, `suspended`, `rejected` o sin estado visible cae al banner.

### Perfil artista

Archivo:

`src/pages/artist/ArtistProfileSettings.jsx`

| Linea | Hallazgo |
|---:|---|
| `224` | Muestra seccion `Estado de validacion`. |
| `229-232` | Renderiza input `studioStatus` desde `profileDraft.registration?.studioStatus`. |

Esto no es una aprobacion real. Es un campo de perfil/draft visible en Artist Settings.

### Panel Platform Owner

Archivo:

`src/pages/admin/AdminDashboard.jsx`

| Linea | Hallazgo |
|---:|---|
| `213` | `pendingReviewStudios = accessibleStudios.filter(studioStatus === pending)`. |
| `231-243` | `updateReviewStatus()` solo hace `setReviewStudios(...)`. |
| `334-349` | Renderiza `Estudios pendientes de validacion` con botones `Aprobar`, `Suspender`, `Solicitar cambios`. |

Conclusion:

Los botones existen visualmente, pero no llaman service ni RPC. Solo mutan estado React local de la pantalla.

## 2. AppContext

### Activar/inactivar artista

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `1342` | Define `toggleManagedArtistStatus`. |
| `1343-1355` | En mock muta `adminState.artists` local. |
| `1362-1363` | En real llama `deactivateAdminArtist()` o `activateAdminArtist()`. |
| `1367-1373` | Actualiza `adminState.artists` con la respuesta real. |

Esto si es escritura real para `artists.status`.

Pero no toca:

- `studios.studio_status`
- `governance_reviews`
- `marketplace_profiles`
- `marketplace_listings`

Por tanto:

```text
Activar artista != aprobar studio
Activar artista != publicar marketplace
```

### Registro/default de validacion

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `247` | `registration.studioStatus` usa `getDefaultStudioStatus()`. |
| `345` | Mocks/estado inicial usan `artist.studioStatus || getDefaultStudioStatus()`. |

`getDefaultStudioStatus()` devuelve `pending`, por eso la experiencia inicial queda en validacion.

## 3. Service Layer

### Admin Artists service

Archivo:

`src/services/adminArtistService.js`

| Linea | Hallazgo |
|---:|---|
| `9-15` | Mapea `studio_status` DB a `studioStatus`. |
| `49` | `mapStudio()` expone `studioStatus`. |
| `87` | `mapArtist()` copia `studioStatus` desde studio. |
| `145-152` | `activateAdminArtist()` llama RPC real. |
| `156-163` | `deactivateAdminArtist()` llama RPC real. |
| `167-174` | `updateAdminArtistProfile()` llama RPC real. |

No existe service para:

- aprobar studio
- rechazar studio
- suspender studio
- publicar artista
- crear `marketplace_profile`
- crear `marketplace_listing`
- cambiar `marketplace_profiles.visibility_status`
- cambiar `marketplace_listings.visibility_status`

### Marketplace service

Archivo:

`src/services/marketplaceService.js`

| Linea | Hallazgo |
|---:|---|
| `109` | Llama `studio_flow_marketplace_get_listings`. |

Es read-only. No publica ni aprueba.

## 4. RPC

### RPCs existentes de artista

Archivo:

`supabase/migrations/202606110007_admin_artists_core_write.sql`

| Linea | RPC | Proposito |
|---:|---|---|
| `259` | `studio_flow_admin_activate_artist` | Cambia `artists.status` a `active` y reactiva membership si aplica. |
| `330` | `studio_flow_admin_deactivate_artist` | Cambia `artists.status` a `inactive` y membership a `inactive`. |
| `401` | `studio_flow_admin_update_artist_profile` | Edita `artists.display_name` y `artist_profiles`. |
| `561-567` | Grants | Las tres RPCs se exponen a `authenticated`. |

Estas RPCs no actualizan Marketplace ni `studio_status`.

### RPC marketplace existente

Archivo:

`supabase/migrations/202606110011_marketplace_read.sql`

| Linea | Hallazgo |
|---:|---|
| `1` | Define `studio_flow_marketplace_get_listings()`. |
| `31-32` | Exige listing/profile visible. |
| `108` | Exige al menos un servicio activo. |
| `180-181` | Es read-only, grant execute a authenticated. |

No hay RPC para publicar.

### Busqueda de RPCs faltantes

No se encontro funcion real para:

- `approveArtist`
- `rejectArtist`
- `publishArtist`
- `artistApproval`
- `studio_flow_admin_approve_studio`
- `studio_flow_admin_reject_studio`
- `studio_flow_admin_suspend_studio`
- `studio_flow_admin_publish_artist`
- `studio_flow_marketplace_publish_profile`
- `studio_flow_marketplace_create_listing`

## 5. Supabase

### Studios / governance

Archivo:

`supabase/migrations/202606100002_milestone_02_studios_artists.sql`

| Linea | Elemento | Uso |
|---:|---|---|
| `1-7` | `studio_status` enum | `pending`, `approved`, `suspended`, `rejected`, `archived`. |
| `57-66` | `studios` | Tiene `studio_status`, `approved_at`, `suspended_at`, `archived_at`. |
| `126-143` | `governance_reviews` | Tabla para revisiones, con status `open`, `approved`, `changes_requested`, `suspended`, `rejected`, `resolved`. |

Existe infraestructura de datos para governance de studios.

Falta:

- RPC de aprobacion/rechazo/suspension.
- Service frontend.
- Loader/update real en Platform Owner.
- Escritura de `governance_reviews`.
- Audit event de decision governance.

### Artists

Archivo:

`supabase/migrations/202606100002_milestone_02_studios_artists.sql`

| Linea | Elemento | Uso |
|---:|---|---|
| `32-36` | `artist_status` enum | `active`, `inactive`, `archived`. |
| `74-83` | `artists` | Tiene `status` default `active`. |

No existe columna de aprobacion editorial de artista:

- no `approval_status`
- no `validation_status`
- no `review_status`
- no `marketplace_status`

### Marketplace

Archivo:

`supabase/migrations/202606100008_milestone_08_marketplace.sql`

| Linea | Elemento | Uso |
|---:|---|---|
| `7-12` | `marketplace_visibility_status` | `draft`, `visible`, `hidden`, `suspended`. |
| `20-31` | `marketplace_profiles` | Perfil publico con `visibility_status`, `published_at`, `hidden_at`. |
| `57-68` | `marketplace_listings` | Listing visible/hidden/expired. |

Existe infraestructura de publicacion.

Falta:

- crear profile/listing desde Platform Owner.
- aprobar profile/listing.
- publicar profile/listing.
- suspender profile/listing.
- despublicar profile/listing.

## 6. Flujos existentes

### Flujo de aprobacion

| Dominio | Existe |
|---|---|
| Aprobacion de artista | No |
| Aprobacion real de studio desde Platform Owner | No conectado |
| Tabla para governance review | Si |
| Botones visuales de studio review | Si, locales |

El unico flujo parecido a aprobacion es `artist_claim_*` en auth foundation, pero corresponde a reclamo/invitacion de artista, no a publicacion Marketplace ni aprobacion de studio.

### Flujo de suspension

| Dominio | Existe |
|---|---|
| Suspender artista | No como status `suspended`; solo `inactive`. |
| Suspender studio | Solo enum/tabla y boton local, no RPC conectada. |
| Suspender servicio | Si existe para `service_offerings`, no para artist/studio. |
| Suspender marketplace profile/listing | Tabla lo soporta parcialmente, no hay flow. |

### Flujo de publicacion

| Dominio | Existe |
|---|---|
| Crear `marketplace_profile` | No conectado |
| Crear `marketplace_listing` | No conectado |
| Cambiar profile a `visible` | No conectado |
| Cambiar listing a `visible` | No conectado |
| Lectura de listings visibles | Si, Fase 17.7 |

## 7. Platform Owner: existentes no conectadas vs inexistentes

### Funcionalidades existentes no conectadas

| Funcionalidad | Evidencia | Estado |
|---|---|---|
| Revisar studios pendientes | `AdminDashboard.jsx` muestra panel de pendientes. | UI local. |
| Aprobar/suspender/solicitar cambios studio | Botones llaman `updateReviewStatus`. | No conecta Supabase. |
| Tabla `governance_reviews` | Existe en Supabase. | No usada por UI/RPC actual. |
| Tablas marketplace | `marketplace_profiles`, `marketplace_listings`. | No hay write flow. |

### Funcionalidades inexistentes

| Funcionalidad | Estado |
|---|---|
| Aprobar artista como entidad editorial | No hay columna/RPC/UI real. |
| Rechazar artista | No hay columna/RPC/UI real. |
| Suspender artista como Marketplace | No hay flow; solo inactivar `artists.status`. |
| Publicar artista | No hay RPC/service/UI. |
| Crear listing desde artista aprobado | No hay flow. |
| Publicar/despublicar listing | No hay flow. |

## 8. Condicion exacta para aparecer en Marketplace

Despues de Fase 17.7, la condicion real esta en:

`supabase/migrations/202606110011_marketplace_read.sql`

| Linea | Condicion |
|---:|---|
| `31` | `marketplace_listings.visibility_status = 'visible'` |
| `32` | `marketplace_profiles.visibility_status = 'visible'` |
| `33` | `expires_at is null or expires_at > now()` |
| `104` | `artists.status = 'active'` |
| `106-107` | Studio no archivado ni suspendido si existe. |
| `108` | `service_offerings` activos asociados: `service_count > 0`. |

Por tanto Dennis debe cumplir:

```text
artist active
marketplace_profile visible
marketplace_listing visible
listing no expirado
al menos un service_offering active compatible
studio no suspended/archived si hay studio
```

Si Dennis solo tiene:

```text
artists.status = active
artist_profiles existe
service_offerings activos
marketplace_listings = 0
```

entonces no aparece. Falta la capa de publicacion:

```text
marketplace_profile + marketplace_listing
```

## 9. Respuesta directa

### Que muestra `En validacion`

`ArtistLayout.jsx` muestra el banner y el pill.

El texto viene de `getStudioStatusLabel(currentStudio?.studioStatus)`.

### Que dato usa

Usa:

```text
currentStudio.studioStatus
```

que mapea desde:

```text
studios.studio_status
```

o fallback local:

```text
getDefaultStudioStatus() = pending
```

### Existe flujo de aprobacion

No como flujo real completo.

Hay UI local para studios pendientes, y tablas de governance, pero no hay RPC/service conectado para aprobar o rechazar.

### Existe flujo de suspension

Parcial:

- artista: inactivar/reactivar real (`artists.status active/inactive`)
- servicios: suspender real (`service_offerings.status = suspended`)
- studio: solo enum/UI local, no write path real encontrado
- marketplace: tabla soporta estados, no write path encontrado

### Existe flujo de publicacion

No.

Solo existe lectura de listings visibles.

## Veredicto

Dennis esta en una zona intermedia:

```text
artista real activo
servicios reales activos
studio/perfil en validacion
sin listing publicado
```

Por eso:

- Artist ve `En validacion`: el studio sigue `pending` o cae al fallback `pending`.
- Cliente ve `No hay perfiles publicados`: no existe listing visible para Marketplace.

Platform Owner hoy no tiene un sistema real conectado para convertir ese estado en:

```text
studio approved
marketplace_profile visible
marketplace_listing visible
```

El siguiente paso correcto no es tocar Marketplace Read, sino disenar/implementar governance write path:

```text
aprobar studio
crear/publicar marketplace_profile
crear/publicar marketplace_listing
auditar decision
refrescar Marketplace
```
