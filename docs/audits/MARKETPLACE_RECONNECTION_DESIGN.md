# FASE 17.6 - MARKETPLACE RECONNECTION DESIGN

## Objetivo

Disenar el Marketplace real de Studio Flow para que `ClientDashboard` deje de depender de estado admin/local y consuma datos reales Supabase.

Este documento no implementa codigo, no crea SQL/RPC y no modifica archivos. Solo define arquitectura objetivo y plan de reconexion.

## Veredicto ejecutivo

El Marketplace cliente debe dejar de ser:

```text
ClientDashboard
  -> adminState.artists
  -> searchServices local
  -> artistMarketplaceProfile local
  -> getAvailableSlots local
```

y convertirse en:

```text
ClientDashboard
  -> marketplaceService
  -> RPC publica/autenticada de marketplace
  -> marketplace_listings / marketplace_profiles
  -> artists / artist_profiles
  -> service_offerings
  -> availability_slots
```

La fuente canonica recomendada para la lista publica es:

```text
marketplace_listings
```

con joins/validaciones hacia:

- `marketplace_profiles`
- `artists`
- `artist_profiles`
- `studios`
- `studio_profiles`
- `artist_studio_memberships`
- `service_offerings`
- `availability_slots`

## 1. Fuente real del Marketplace

### Tabla principal recomendada: `marketplace_listings`

Debe ser la fuente operacional de discovery.

Motivo:

- Representa lo visible/buscable.
- Tiene `visibility_status`.
- Puede apuntar a artista, studio o membership.
- Ya existe FK desde `appointments.marketplace_listing_id`.

Uso objetivo:

```text
marketplace_listings.visibility_status = 'visible'
and (expires_at is null or expires_at > now())
```

### Tabla de perfil publico: `marketplace_profiles`

Debe controlar publicacion y estado editorial.

Uso objetivo:

```text
marketplace_profiles.visibility_status = 'visible'
```

Debe aportar:

- titulo publico
- resumen
- tipo: artist / studio / membership
- target id

### Entidades core

| Tabla | Uso en Marketplace |
|---|---|
| `artists` | Estado operativo del artista. |
| `artist_profiles` | Nombre artistico, bio, foto, especialidades, ciudad, links, ubicacion. |
| `studios` | Estado del studio y scope. |
| `studio_profiles` | Nombre comercial, direccion, logo, ciudad. |
| `artist_studio_memberships` | Relacion artista-studio cuando el listing es de membership. |

### Servicios reales

Tabla:

```text
service_offerings
```

Debe reemplazar:

- `searchServices`
- `artistMarketplaceProfile.services`
- `marketplaceServices` local por artista

Condiciones:

```text
service_offerings.status = 'active'
and owner compatible con listing:
  owner_type = 'artist' and artist_id = listing.artist_id
  or owner_type = 'membership' and membership_id = listing.membership_id
  or owner_type = 'studio' and studio_id = listing.studio_id
```

### Disponibilidad real

Tabla:

```text
availability_slots
```

Debe reemplazar:

- `getAvailableSlots()` local
- `agendaSettings.schedule`
- `agendaSettings.bookedSlots`

Condiciones:

```text
availability_slots.status = 'available'
and starts_at >= now()
and artist/membership/studio compatible con listing
```

## 2. Arquitectura objetivo

```text
Cliente
  -> ClientDashboard / Marketplace
  -> buscar por servicio, artista, studio, ciudad
  -> marketplaceService.fetchMarketplaceListings()
  -> RPC studio_flow_marketplace_get_listings()
  -> listings visibles con servicios reales y conteo de disponibilidad
  -> selecciona listing
  -> marketplaceService.fetchMarketplaceAvailability()
  -> RPC studio_flow_marketplace_get_availability()
  -> slots reales
  -> bookSlot()
  -> bookingService.createBooking()
  -> RPC studio_flow_client_book_appointment()
```

Separacion de responsabilidades:

| Capa | Responsabilidad |
|---|---|
| Frontend | Render, filtros UI, seleccion. |
| AppContext | Estado de sesion, cache ligera, frontera real/demo. |
| Service Layer | Llamadas RPC y normalizacion. |
| RPC | Seguridad, joins, reglas de visibilidad, scope y transaccion. |
| Supabase | Fuente canonica. |

## 3. Datos que deben alimentar Marketplace

### Para listado

Payload recomendado:

```json
{
  "listings": [
    {
      "listingId": "uuid",
      "profileId": "uuid",
      "profileType": "artist|studio|membership",
      "artistId": "uuid",
      "studioId": "uuid|null",
      "membershipId": "uuid|null",
      "title": "Dennis Beauty Studio",
      "summary": "texto",
      "artistName": "Dennis Beauty Studio",
      "studioName": "Studio",
      "city": "Ciudad",
      "photoPath": "path",
      "portfolioPaths": [],
      "specialties": [],
      "services": [],
      "availability": {
        "availableCount": 0,
        "nextSlotAt": "timestamptz|null"
      },
      "visibilityStatus": "visible"
    }
  ]
}
```

Fuentes:

| Campo | Fuente |
|---|---|
| `listingId` | `marketplace_listings.id` |
| `profileId` | `marketplace_profiles.id` |
| `profileType` | `marketplace_profiles.profile_type` |
| `artistId` | `marketplace_listings.artist_id` / profile target |
| `studioId` | `marketplace_listings.studio_id` |
| `membershipId` | `marketplace_listings.membership_id` |
| `title` | `marketplace_profiles.title` |
| `summary` | `marketplace_profiles.summary` |
| `artistName` | `artist_profiles.artistic_name` / `artists.display_name` |
| `studioName` | `studio_profiles.commercial_name` / `studios.name` |
| `city` | listing city, artist profile city, studio profile city |
| `services` | `service_offerings` |
| `availableCount` | `availability_slots` |

### Para servicios

Cada servicio visible debe incluir:

```json
{
  "id": "service_offering_id",
  "name": "Lash lifting",
  "priceAmount": 900,
  "durationMinutes": 70,
  "serviceTier": "basic",
  "ownerType": "artist|studio|membership"
}
```

### Para disponibilidad

Cada slot debe incluir:

```json
{
  "id": "availability_slot_id",
  "artistId": "uuid",
  "studioId": "uuid|null",
  "membershipId": "uuid|null",
  "startsAt": "timestamptz",
  "endsAt": "timestamptz",
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "end": "HH:mm",
  "status": "available"
}
```

## 4. RPCs necesarias

### `studio_flow_marketplace_get_listings`

Uso:

Listado publico/autenticado para cliente.

Parametros sugeridos:

```text
p_query text default null
p_service_query text default null
p_city text default null
p_date_from date default current_date
p_date_to date default current_date + 14
```

Responsabilidades:

- Leer listings visibles.
- Validar profile visible.
- Excluir artistas/studios suspendidos/archivados.
- Agregar servicios activos.
- Agregar conteo de slots disponibles.
- Devolver payload ya normalizado para UI.

Debe leer:

- `marketplace_listings`
- `marketplace_profiles`
- `artists`
- `artist_profiles`
- `studios`
- `studio_profiles`
- `artist_studio_memberships`
- `service_offerings`
- `availability_slots`

### `studio_flow_marketplace_get_listing_detail`

Uso:

Detalle expandido de un listing.

Parametros:

```text
p_listing_id uuid
```

Responsabilidades:

- Devolver perfil publico completo.
- Devolver servicios reales completos.
- Devolver datos de ubicacion/contacto permitidos.

Puede ser opcional si `get_listings` ya devuelve suficiente informacion para primera version.

### `studio_flow_marketplace_get_availability`

Uso:

Slots reales al elegir fecha/servicio.

Parametros:

```text
p_listing_id uuid
p_service_offering_id uuid
p_date_from date
p_date_to date
```

Responsabilidades:

- Validar listing visible.
- Validar service compatible.
- Filtrar slots `available`.
- Respetar duracion si los slots no estan precomputados por servicio.
- Devolver slots con `availability_slot_id`.

### `studio_flow_client_book_appointment`

Uso:

Booking transaccional real.

Parametros:

```text
p_booking jsonb
```

Payload minimo:

```json
{
  "availability_slot_id": "uuid",
  "service_offering_id": "uuid",
  "marketplace_listing_id": "uuid",
  "client_notes": ""
}
```

Responsabilidades:

- Resolver client desde `auth.uid()`.
- Lock slot `for update`.
- Insertar `appointments`.
- Insertar `appointment_status_events`.
- Insertar `appointment_economies`.
- Marcar slot `booked`.

## 5. Services necesarios

### `src/services/marketplaceService.js`

Funciones:

```text
fetchMarketplaceListings(filters)
fetchMarketplaceListingDetail(listingId)
fetchMarketplaceAvailability({ listingId, serviceOfferingId, dateFrom, dateTo })
```

Debe:

- llamar RPCs de marketplace.
- normalizar nombres camelCase.
- mapear a shape visual actual.
- no usar `adminState`.

### `src/services/bookingService.js`

Funciones:

```text
createBooking({ availabilitySlotId, serviceOfferingId, marketplaceListingId, clientNotes })
```

Debe:

- validar IDs minimos.
- llamar `studio_flow_client_book_appointment`.
- devolver appointment normalizada.

## 6. AppContext objetivo

Agregar estado separado del admin:

```text
marketplaceState
  listings
  selectedListing
  availability
  loaded
  error
```

Loaders:

```text
loadMarketplaceListings(filters)
loadMarketplaceAvailability(params)
```

Reglas:

- `marketplaceState` no debe depender de `adminState`.
- En sesiones reales cliente, Marketplace debe cargar su propia fuente.
- En sesiones mock, puede conservar mock/local si se desea demo.
- `bookSlot()` para sesiones reales debe delegar a `bookingService`.

## 7. Frontend objetivo

`ClientDashboard` debe conservar visual, pero cambiar fuentes:

| UI actual | Fuente actual | Fuente objetivo |
|---|---|---|
| Resultados marketplace | `marketplaceArtists` desde `adminState.artists` | `marketplaceState.listings` |
| Servicios primarios/secundarios | `searchServices` local | categorias/servicios derivados de `service_offerings` |
| Servicios por artista | `artist.marketplaceServices` local | `listing.services` reales |
| Disponibilidad | `getAvailableSlots()` local | `marketplaceState.availability` |
| Reservar | `bookSlot()` local | `bookingService.createBooking()` via AppContext |

La UI no debe necesitar saber:

- si el servicio pertenece a artist/studio/membership;
- como calcular economy;
- como bloquear el slot;
- como insertar status events.

## 8. Mocks/datos actuales que deben desaparecer

### Eliminar del flujo real

| Fuente | Reemplazo |
|---|---|
| `adminState.artists` | `marketplaceState.listings` |
| `adminState.studios` | Datos de listing/profile/studio desde RPC marketplace |
| `searchServices` | Servicios reales agrupados por categoria |
| `artistMarketplaceProfile` | `marketplace_profiles` + `service_offerings` |
| `hydrateMarketplaceArtist()` | Mapper de listing real |
| `getAvailableSlots()` local | RPC availability real |
| `agendaSettings.bookedSlots` | `appointments` + `availability_slots.status` |
| `clientState.favoriteArtistIds` para discovery | `favorite_artists` cuando se conecte favoritos |

### Mantener solo demo/dev

| Fuente | Uso permitido |
|---|---|
| `searchServices` | Demo sin Supabase, si se conserva. |
| `artistMarketplaceProfile` | Demo/storybook, no sesion real. |
| `getAvailableSlots()` local | QA/dev o mock session. |
| `adminState.artists` | Admin, no Marketplace cliente. |

## 9. Plan por fases

### Fase Marketplace Read

Objetivo:

Que el cliente vea artistas/listings reales.

Implementar conceptualmente:

1. RPC `studio_flow_marketplace_get_listings`.
2. `marketplaceService.fetchMarketplaceListings`.
3. `AppContext.loadMarketplaceListings`.
4. `ClientDashboard` usa `marketplaceState.listings`.
5. Empty state real si no hay listings visibles.

No incluir aun:

- booking real.
- availability detallada por slot.

Criterio de listo:

Dennis aparece si existe listing/profile visible y cumple estado operativo.

### Fase Availability Read

Objetivo:

Que el cliente vea horarios reales.

Implementar conceptualmente:

1. RPC `studio_flow_marketplace_get_availability`.
2. `marketplaceService.fetchMarketplaceAvailability`.
3. `ClientDashboard` reemplaza `getAvailableSlots()`.
4. Slots incluyen `availabilitySlotId`.
5. Servicios incluyen `serviceOfferingId`.

Criterio de listo:

El boton `Reservar` tiene ambos:

```text
availabilitySlotId
serviceOfferingId
```

### Fase Booking Write

Objetivo:

Crear citas reales.

Implementar conceptualmente:

1. RPC `studio_flow_client_book_appointment`.
2. `bookingService.createBooking`.
3. `AppContext.bookSlot()` delega a service en sesiones reales.
4. Refrescar:
   - `loadClientAppointments()`
   - availability del listing
   - opcionalmente caches admin/artist si estan montados
5. Retirar `bookedSlots` del flujo real.

Criterio de listo:

Una reserva desde Marketplace crea:

- `appointments`
- `appointment_status_events`
- `appointment_economies`
- `availability_slots.status = booked`

## 10. Reglas de producto

### Visibilidad

Un listing debe mostrarse solo si:

```text
marketplace_listings.visibility_status = 'visible'
marketplace_profiles.visibility_status = 'visible'
artist.status = 'active'
studio no suspendido si aplica
membership.status = 'active' si aplica
hay al menos un service_offering active
```

La disponibilidad puede ser:

- un filtro duro: mostrar solo si hay slots;
- o un badge: mostrar aunque no haya slots, pero con "sin horarios".

Recomendacion:

Para discovery, mostrar listings visibles aunque no tengan slots, pero deshabilitar reserva y mostrar empty state de disponibilidad.

### Servicios

El filtro por servicio debe buscar en:

```text
service_offerings.name
service_categories.name
artist_profiles.specialties
```

No en arrays locales.

### Listings cero

Si `marketplace_listings = 0`, un Marketplace real debe mostrar:

```text
No hay perfiles publicados.
```

No debe recurrir a `adminState.artists`.

## Veredicto

El Marketplace real debe construirse como una lectura publica/autenticada propia, no como una extension de Admin Artists.

La fuente objetivo es:

```text
marketplace_listings
  -> marketplace_profiles
  -> artists / artist_profiles / studios / studio_profiles
  -> service_offerings
  -> availability_slots
```

`ClientDashboard` debe dejar de depender de `adminState.artists`, `searchServices`, `artistMarketplaceProfile` y `getAvailableSlots()` en sesiones reales.

El orden correcto es:

```text
1. Marketplace Read
2. Availability Read
3. Booking Write
```

Esto evita intentar escribir citas reales antes de tener servicios y slots reales seleccionables.

