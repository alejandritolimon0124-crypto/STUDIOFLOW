# FASE 17.8B - INDEPENDENT ARTIST PUBLICATION DESIGN

## Objetivo

Disenar el flujo completo para publicar artistas independientes en Marketplace.

Este documento no implementa codigo, no crea SQL/RPC y no modifica UI. Solo diseno tecnico.

## Veredicto ejecutivo

Un artista independiente no debe pasar por `studios.studio_status`.

El flujo correcto es:

```text
artist active
  -> artist profile completo
  -> service_offerings owner_type = artist activos
  -> Platform Owner review/publication decision
  -> marketplace_profile profile_type = artist
  -> marketplace_listing visible
  -> Marketplace Read
```

Para Dennis Beauty Studio, el bloqueo real no es governance de studio. Es ausencia de:

```text
marketplace_profiles.profile_type = artist
marketplace_listings.visibility_status = visible
```

## 1. Flujo objetivo

```text
Artist
  -> Publication readiness
  -> Platform Owner review
  -> Publish independent artist
  -> marketplace_profiles
  -> marketplace_listings
  -> Marketplace
```

### Detalle

```text
artists.status = active
  -> artist_profiles existe
  -> service_offerings activos owner_type = artist
  -> RPC de publicacion valida requisitos
  -> upsert marketplace_profiles(profile_type = artist)
  -> upsert marketplace_listings
  -> visibility visible
  -> Marketplace Read lo devuelve
```

## 2. Tablas involucradas

| Dominio | Tabla | Uso |
|---|---|---|
| Artista core | `artists` | Identidad operativa del artista. |
| Perfil publico | `artist_profiles` | Nombre artistico, bio, foto, ciudad, contacto, ubicacion. |
| Servicios | `service_offerings` | Servicios reales del artista independiente. |
| Marketplace profile | `marketplace_profiles` | Perfil publicable tipo `artist`. |
| Marketplace listing | `marketplace_listings` | Entrada visible en Marketplace. |
| Auditoria | `audit_events` | Historial de publicacion/despublicacion. |

No se requiere:

- `studios`
- `studio_profiles`
- `artist_studio_memberships`
- `governance_reviews` de studio

## 3. Estados oficiales

### Artist

Fuente:

```text
artists.status
```

| Estado | Uso en publicacion |
|---|---|
| `active` | Elegible para publicacion. |
| `inactive` | No elegible o debe ocultarse. |
| `archived` | No publicable. |

### Marketplace profile

Fuente:

```text
marketplace_profiles.visibility_status
```

| Estado | Uso |
|---|---|
| `draft` | Perfil preparado pero no visible. |
| `visible` | Perfil publicado. |
| `hidden` | Oculto manualmente. |
| `suspended` | Oculto por governance/riesgo. |

### Marketplace listing

Fuente:

```text
marketplace_listings.visibility_status
```

| Estado | Uso |
|---|---|
| `visible` | Aparece en Marketplace. |
| `hidden` | No aparece. |
| `expired` | Vencido/retirado. |

## 4. Validaciones minimas

Para publicar un artista independiente:

```text
artists.status = active
artist_profiles existe
artist_profiles.artistic_name no vacio
artist_profiles.city no vacio o ubicacion suficiente
service_offerings owner_type = artist status = active count > 0
service_offerings.artist_id = artist.id
```

Validaciones recomendadas:

| Requisito | Motivo |
|---|---|
| `artist_profiles.artistic_name` | Titulo publico. |
| `artist_profiles.bio` o `primary_specialty` | Perfil minimo. |
| `artist_profiles.city` o ubicacion | Discovery local. |
| `photo_path` opcional pero recomendado | Calidad visual. |
| `whatsapp` o contacto | Conversion antes de booking real. |
| Servicios activos | Marketplace no debe mostrar perfiles sin oferta. |

Si faltan requisitos, la RPC debe devolver:

```json
{
  "publicationStatus": "blocked",
  "missing": ["active_services", "city"]
}
```

## 5. RPCs necesarias

### Publicar artista independiente

```text
studio_flow_admin_publish_independent_artist(
  p_artist_id uuid,
  p_title text default null,
  p_summary text default null,
  p_city text default null
)
returns jsonb
```

Responsabilidades:

1. Validar `auth.uid()`.
2. Validar rol `platform_owner`.
3. Bloquear `artists` con `for update`.
4. Validar `artists.status = active`.
5. Validar `artist_profiles`.
6. Validar servicios activos `owner_type = artist`.
7. Crear o actualizar `marketplace_profiles`:

```text
profile_type = artist
artist_id = p_artist_id
studio_id = null
membership_id = null
visibility_status = visible
published_at = now()
```

8. Crear o actualizar `marketplace_listings`:

```text
marketplace_profile_id = profile.id
artist_id = p_artist_id
studio_id = null
membership_id = null
city = p_city or artist_profiles.city
visibility_status = visible
expires_at = null
```

9. Registrar `audit_events`.
10. Retornar profile/listing normalizado.

### Despublicar artista independiente

```text
studio_flow_admin_unpublish_independent_artist(
  p_artist_id uuid,
  p_reason text default null
)
returns jsonb
```

Responsabilidades:

- Cambiar `marketplace_profiles.visibility_status = hidden`.
- Cambiar listings relacionados a `hidden`.
- Registrar `audit_events`.

### Suspender publicacion de artista

```text
studio_flow_admin_suspend_independent_artist_publication(
  p_artist_id uuid,
  p_reason text
)
returns jsonb
```

Responsabilidades:

- Cambiar `marketplace_profiles.visibility_status = suspended`.
- Cambiar listings a `hidden` o `expired`.
- No necesariamente cambiar `artists.status`.
- Registrar `audit_events`.

### Readiness

```text
studio_flow_admin_get_independent_artist_publication_readiness(
  p_artist_id uuid
)
returns jsonb
```

Debe devolver:

- artista
- artist profile
- active service count
- marketplace profile status
- listing status
- missing requirements
- `canPublish`

## 6. Service Layer

Crear o extender:

```text
src/services/governanceService.js
```

Funciones:

```text
fetchIndependentArtistPublicationReadiness(artistId)
publishIndependentArtist({ artistId, title, summary, city })
unpublishIndependentArtist({ artistId, reason })
suspendIndependentArtistPublication({ artistId, reason })
```

No debe:

- insertar directamente en tablas.
- decidir eligibility solo en frontend.
- depender de `adminState.studios`.

## 7. AppContext

Agregar acciones:

```text
loadIndependentArtistPublicationReadiness(artistId)
publishIndependentArtist()
unpublishIndependentArtist()
suspendIndependentArtistPublication()
```

Despues de publicar/despublicar:

```text
loadAdminArtists()
loadGovernanceQueue() o publication queue
loadMarketplaceListings() si aplica
```

Estado sugerido:

```text
publicationState = {
  independentArtists: [],
  readinessByArtistId: {},
  loaded: false,
  lastPublication: null
}
```

## 8. Platform Owner UI

### Donde vivir

No debe vivir dentro de `Estudios pendientes de validacion`.

Debe existir una cola separada:

```text
Publicacion Marketplace
  -> Artistas independientes
  -> Studios
  -> Memberships
```

### Para artistas independientes mostrar

- nombre artistico
- ciudad
- estado `artists.status`
- cantidad de servicios activos
- perfil publico completo/incompleto
- marketplace profile status
- listing status
- acciones

### Acciones

| Boton | RPC |
|---|---|
| Publicar | `studio_flow_admin_publish_independent_artist` |
| Ocultar | `studio_flow_admin_unpublish_independent_artist` |
| Suspender publicacion | `studio_flow_admin_suspend_independent_artist_publication` |
| Revisar requisitos | `studio_flow_admin_get_independent_artist_publication_readiness` |

## 9. Como decide Platform Owner si es publicable

Platform Owner debe decidir sobre una combinacion de readiness tecnico y criterio editorial.

### Readiness tecnico

Backend calcula:

```text
artist active
artist profile exists
active artist-owned services > 0
contact/location enough
not already suspended
```

### Criterio editorial

Platform Owner revisa:

- calidad del nombre/titulo
- bio clara
- servicios coherentes
- fotos si existen
- ubicacion/contacto
- ausencia de riesgo

Decision:

```text
Publicar
Ocultar
Suspender publicacion
Solicitar cambios editoriales
```

## 10. Crear marketplace_profile tipo artist

Upsert recomendado:

```text
conflict target: marketplace_profiles_artist_unique
```

Datos:

```text
profile_type = artist
artist_id = artist.id
studio_id = null
membership_id = null
title = p_title or artist_profiles.artistic_name or artists.display_name
summary = p_summary or artist_profiles.bio
visibility_status = visible
published_at = now()
hidden_at = null
```

Si existe profile `hidden` o `draft`, se actualiza a `visible`.

Si existe profile `suspended`, la RPC debe requerir decision explicita o una RPC de levantar suspension.

## 11. Crear marketplace_listing asociado

Datos:

```text
marketplace_profile_id = profile.id
artist_id = artist.id
studio_id = null
membership_id = null
city = p_city or artist_profiles.city
visibility_status = visible
expires_at = null
```

Como no hay unique index para listing por profile, se recomienda en fase de SQL:

- buscar listing existente visible/hidden para el profile;
- actualizarlo si existe;
- insertar si no existe.

No crear multiples listings duplicados para el mismo artist profile salvo que el producto defina campañas/listings temporales.

## 12. Artist Dashboard sin studio

### Problema actual

`ArtistLayout` calcula:

```text
currentStudio
studioAccess
isPendingExperience
getStudioStatusLabel(currentStudio?.studioStatus)
```

Para artista independiente sin studio:

```text
currentStudio = undefined
getStudioStatusLabel(undefined) = En validacion
```

Esto es semanticamente incorrecto.

### Experiencia objetivo

Si artista no tiene studio/membership:

```text
No mostrar banner de studio validation.
Mostrar estado de publicacion independiente.
```

Estados sugeridos:

| Estado | Copy |
|---|---|
| no marketplace profile | `Perfil no publicado` |
| draft/hidden | `Perfil preparado, pendiente de publicacion` |
| visible | `Publicado en Marketplace` |
| suspended | `Publicacion pausada` |
| missing requirements | `Completa tu perfil para revision` |

### Fuente del estado

No usar:

```text
studio_status
currentStudio
getStudioStatusLabel
```

Usar:

```text
marketplace_profiles.visibility_status
marketplace_listings.visibility_status
publication readiness
```

### Regla UI

```text
if artist has active membership/studio:
  show studio governance banner if needed
else:
  show independent artist publication status
```

## 13. Auditoria

Cada publicacion debe escribir:

```text
audit_events.context = marketplace
audit_events.entity_type = marketplace_profile or marketplace_listing
event_type = independent_artist_published
```

Metadata:

```json
{
  "artistId": "uuid",
  "profileType": "artist",
  "listingId": "uuid",
  "decision": "publish",
  "missingBeforePublish": []
}
```

Eventos:

- `independent_artist_published`
- `independent_artist_unpublished`
- `independent_artist_publication_suspended`
- `independent_artist_publication_readiness_checked`

## 14. Plan por fases

### Fase A: Readiness

- RPC readiness.
- Service.
- UI Platform Owner muestra artistas independientes elegibles/no elegibles.

### Fase B: Publish

- RPC publish.
- Crear/actualizar `marketplace_profiles`.
- Crear/actualizar `marketplace_listings`.
- Audit event.

### Fase C: Unpublish/Suspend

- RPC hide/suspend.
- UI acciones.
- Audit events.

### Fase D: Artist Dashboard

- Separar experiencia de artista independiente.
- Remover banner `En validacion` cuando no hay studio.
- Mostrar estado de publicacion independiente.

## 15. Resultado esperado Dennis

Antes:

```text
artists.status = active
artist independiente
service_offerings owner_type = artist active
no marketplace profile/listing
Marketplace = No hay perfiles publicados
Artist UI = En validacion por fallback incorrecto
```

Despues de publish:

```text
marketplace_profiles.profile_type = artist
marketplace_profiles.artist_id = Dennis
marketplace_profiles.visibility_status = visible
marketplace_listings.artist_id = Dennis
marketplace_listings.visibility_status = visible
Marketplace muestra Dennis
Artist UI muestra Publicado en Marketplace
```

## Veredicto

El flujo de artistas independientes debe ser una publicacion Marketplace directa sobre `artist`, no una aprobacion de studio.

La arquitectura correcta es:

```text
artist readiness
  -> Platform Owner publish decision
  -> marketplace_profile artist
  -> marketplace_listing artist
  -> Marketplace Read
```

Y la experiencia de Artist Dashboard debe dejar de usar `studio_status` cuando el artista no pertenece a un studio.
