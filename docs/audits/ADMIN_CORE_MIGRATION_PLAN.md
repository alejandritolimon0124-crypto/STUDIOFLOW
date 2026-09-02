# FASE 15.1 - ADMIN CORE MIGRATION PLAN

## Objetivo

Migrar solo:

```txt
AdminArtists
AdminClients
```

a Supabase.

No tocar en esta fase:

```txt
Marketplace
Agenda
Dashboard
AdminStudioProfile
AdminServices
AdminAppointments
AdminSettings
```

Este documento es plan tecnico. No implementa cambios.

## 1. Tablas existentes para artistas y clientes

### Identidad base

Tabla:

```txt
profiles
```

Archivo:

```txt
supabase/migrations/202606100001_milestone_01_identity_access.sql
```

Columnas:

```txt
id
display_name
email
phone
default_role
status
created_at
updated_at
archived_at
```

Uso Admin esperado:

- nombre base
- email
- telefono
- estado global del perfil
- relacion con roles

### Artistas

Tabla:

```txt
artists
```

Archivo:

```txt
supabase/migrations/202606100002_milestone_02_studios_artists.sql
```

Columnas:

```txt
id
profile_id
display_name
status
created_at
updated_at
archived_at
```

Uso Admin esperado:

- listado de artistas
- activar/desactivar artista
- nombre visible operativo

### Perfil profesional de artista

Tabla:

```txt
artist_profiles
```

Columnas base:

```txt
id
artist_id
artistic_name
bio
specialties
photo_path
portfolio_paths
city
created_at
updated_at
```

Columnas agregadas en Fase 14.9:

```txt
primary_specialty
years_experience
payment_methods
whatsapp
instagram
facebook
tiktok
website
use_studio_location
address_line
state
postal_code
latitude
longitude
address_references
google_maps_url
```

Uso Admin esperado:

- ciudad
- descripcion
- especialidades
- ubicacion profesional del artista

### Membresia artista-estudio

Tabla:

```txt
artist_studio_memberships
```

Columnas:

```txt
id
artist_id
studio_id
role
status
started_at
ended_at
created_at
updated_at
archived_at
```

Uso Admin esperado:

- filtrar artistas por estudio
- determinar permisos de studio owner/manager
- activar/desactivar relacion artista-estudio sin borrar artista global

### Estudios y perfil de estudio

Tablas:

```txt
studios
studio_profiles
```

Columnas relevantes:

```txt
studios.id
studios.owner_profile_id
studios.name
studios.studio_status
studios.risk_score
studios.approved_at
studios.suspended_at
studios.archived_at

studio_profiles.studio_id
studio_profiles.commercial_name
studio_profiles.description
studio_profiles.email
studio_profiles.phone
studio_profiles.address_line
studio_profiles.city
studio_profiles.geo_lat
studio_profiles.geo_lng
studio_profiles.logo_path
studio_profiles.gallery_paths
```

Uso AdminArtists esperado:

- mostrar estudio asignado
- guardar ubicacion de estudio si se mantiene esa edicion dentro de AdminArtists

### Clientes

Tabla:

```txt
clients
```

Columnas:

```txt
id
profile_id
display_name
email
phone
status
created_at
updated_at
archived_at
```

Uso Admin esperado:

- listado de clientes
- activar/desactivar cliente
- editar identidad visible basica

### Perfil extendido de cliente

Tabla:

```txt
client_profiles
```

Columnas:

```txt
id
client_id
birthday
preferred_services
last_visit_at
next_recommended_visit_at
created_at
updated_at
```

Uso Admin esperado:

- preferencias
- historial resumido
- recomendaciones futuras

### Notas privadas de cliente

Tabla:

```txt
customer_private_notes
```

Columnas relevantes:

```txt
client_id
scope_type
artist_id
studio_id
membership_id
note
created_by_profile_id
archived_at
```

Uso Admin esperado:

- reemplazar `client.notes`
- notas por estudio/artista/membresia

## 2. Campos que necesita cada pantalla

## AdminArtists

Archivo:

```txt
src/pages/admin/AdminArtists.jsx
```

Campos visibles actuales:

| UI | Estado actual | Supabase recomendado |
|---|---|---|
| Nombre | `artist.name` | `artists.display_name` y/o `artist_profiles.artistic_name` |
| Owner | `artist.owner` | `profiles.display_name` del `artists.profile_id` |
| Ciudad | `artist.city` | `artist_profiles.city` |
| Plan | `artist.plan` | No hay tabla/columna actual; requiere billing/subscription futura o mantener fuera de 15.1 |
| Servicios | `artist.services` free text | resumen desde `service_offerings`; no editar en 15.1 |
| Descripcion | `artist.description` | `artist_profiles.bio` |
| Revenue | `artist.revenue` | No migrar; dashboard/economy futura |
| Status Activo/Inactivo | `artist.status` | `artists.status` o `artist_studio_memberships.status` |
| Ubicacion artista: useStudioLocation | `artist.professionalLocation.useStudioLocation` | `artist_profiles.use_studio_location` |
| Ubicacion artista: direccion | `artist.professionalLocation.customLocation.address` | `artist_profiles.address_line` |
| Ubicacion artista: ciudad | `artist.professionalLocation.customLocation.city` | `artist_profiles.city` |
| Ubicacion artista: estado | `artist.professionalLocation.customLocation.state` | `artist_profiles.state` |
| Ubicacion artista: postal | `artist.professionalLocation.customLocation.postalCode` | `artist_profiles.postal_code` |
| Ubicacion artista: lat | `artist.professionalLocation.customLocation.latitude` | `artist_profiles.latitude` |
| Ubicacion artista: lng | `artist.professionalLocation.customLocation.longitude` | `artist_profiles.longitude` |
| Ubicacion artista: referencias | `artist.professionalLocation.customLocation.address_references` | `artist_profiles.address_references` |
| Ubicacion estudio | `studio.professionalLocation` | `studio_profiles` |

Campos que no deben migrarse en 15.1:

```txt
Plan
Revenue
Servicios free text
Dashboard artista mock
```

## AdminClients

Archivo:

```txt
src/pages/admin/AdminClients.jsx
```

Campos visibles actuales:

| UI | Estado actual | Supabase recomendado |
|---|---|---|
| Nombre | `client.name` | `clients.display_name`, opcional `profiles.display_name` |
| Correo | `client.email` | `clients.email`, opcional `profiles.email` |
| Telefono | `client.phone` | `clients.phone`, opcional `profiles.phone` |
| Segmento | `client.segment` | No existe columna; en 15.1 derivar de loyalty o dejar read-only/mock |
| Estado | `client.status` | `clients.status` |
| Citas count | `client.appointments` | derivar de `appointments` futura; no en 15.1 si no se toca Agenda |
| Spend | `client.spend` | derivar de appointment_economies futura; no en 15.1 |
| Notas | `client.notes` | `customer_private_notes.note` |
| Historial | `client.history` mock | `appointments` futura; no en 15.1 |

Campos que no deben migrarse en 15.1:

```txt
segment
appointments count
spend
history real
loyalty
```

## 3. Funciones de AppContext que deben reemplazarse

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funciones actuales locales:

```txt
toggleManagedArtistStatus()
updateManagedArtistProfile()
updateManagedStudioProfile()
toggleManagedClientStatus()
updateManagedClientProfile()
```

Plan:

### Mantener compatibilidad de API para UI

Para reducir blast radius, conservar nombres expuestos inicialmente:

```txt
adminArtists
adminClients
isAdminCoreLoading
adminCoreError
loadAdminCore()
toggleManagedArtistStatus()
updateManagedArtistProfile()
toggleManagedClientStatus()
updateManagedClientProfile()
```

Pero cambiar internamente:

```txt
setAdminState-only
```

por:

```txt
service layer Supabase -> setAdminState cache
```

### Reemplazos recomendados

| Funcion actual | Reemplazo interno |
|---|---|
| `toggleManagedArtistStatus(artistId)` | `updateAdminArtistStatus({ artistId, status })` |
| `updateManagedArtistProfile(artistId, updates)` | `saveAdminArtistProfile({ artistId, updates })` |
| `toggleManagedClientStatus(clientId)` | `updateAdminClientStatus({ clientId, status })` |
| `updateManagedClientProfile(clientId, updates)` | `saveAdminClientProfile({ clientId, updates })` |
| `updateManagedStudioProfile(studioId, updates)` | No migrar en 15.1 salvo si AdminArtists sigue editando studio location |

Decision clave:

Para respetar "NO TOCAR Dashboard/Marketplace/Agenda", `adminState` puede seguir existiendo como cache de compatibilidad, pero para AdminArtists/AdminClients debe hidratarse desde Supabase cuando hay sesion real admin.

## 4. Partes que usan `adminState` / localStorage

### AdminArtists

Usa:

```txt
adminState.artists
adminState.studios
```

Dependencias:

```txt
deriveMembershipsFromLegacyData({ artists: adminState.artists })
getStudiosForArtist()
getArtistsForStudio()
getStudioForArtist()
filterByStudioAccess indirectamente en otros modulos
```

Riesgo:

Los helpers actuales asumen shape legacy:

```txt
artist.id = "artist-1"
artist.studioId
artist.owner
artist.name
artist.city
artist.plan
artist.services
```

La migracion debe mapear rows Supabase a un shape compatible, o refactorizar helpers. Para fase 15.1 conviene mapper compatible.

### AdminClients

Usa:

```txt
adminState.clients
adminState.artists
adminState.studios
```

Riesgo:

`filterByStudioAccess()` depende de `studioId` y de relacion cliente-estudio que no existe directamente en `clients`.

En schema actual no hay una tabla clara `client_studio_memberships`. La relacion cliente-estudio se puede inferir por `appointments`, pero Agenda no se toca en esta fase.

Plan conservador:

- Platform owner: listar todos los `clients`.
- Studio owner/manager: durante 15.1 listar clientes solo si existe relacion derivable por appointments en una fase posterior, o mantener filtro local hasta migrar appointments.
- Otra opcion: crear read model/RPC que resuelva acceso, pero eso ya implica diseño adicional.

### localStorage

Actualmente:

```txt
adminStateStorageKey = 'studio-flow-admin-state'
```

Plan:

- No eliminar en 15.1 para no romper Dashboard/Studio/Profile demo.
- Para AdminArtists/AdminClients, Supabase debe ganar cuando hay sesion real.
- `localStorage` queda como fallback demo para `loginDemo()`.

## 5. Service layer que debe crearse

Archivo recomendado:

```txt
src/services/adminCoreService.js
```

Funciones:

```js
fetchAdminArtists({ profileId, role, studioId })
fetchAdminClients({ profileId, role, studioId })
updateAdminArtistStatus({ artistId, status })
saveAdminArtistProfile({ artistId, profile })
updateAdminClientStatus({ clientId, status })
saveAdminClientProfile({ clientId, profile })
saveAdminCustomerNote({ clientId, note, scope })
```

Opcional si AdminArtists conserva edicion de ubicacion del estudio:

```js
saveAdminStudioLocation({ studioId, location })
```

Pero esto toca parcialmente Admin Studio. Mejor dejarlo fuera de 15.1 o limitar la edicion en AdminArtists a datos de artista.

## 6. Consultas Supabase recomendadas

## Artistas

Lectura base:

```txt
artists
profiles
artist_profiles
artist_studio_memberships
studios
studio_profiles
service_offerings
```

Consulta ideal con joins:

```js
supabase
  .from('artists')
  .select(`
    id,
    profile_id,
    display_name,
    status,
    created_at,
    updated_at,
    profile:profiles(id, display_name, email, phone, status),
    artist_profile:artist_profiles(
      id,
      artistic_name,
      bio,
      specialties,
      city,
      primary_specialty,
      use_studio_location,
      address_line,
      state,
      postal_code,
      latitude,
      longitude,
      address_references
    ),
    memberships:artist_studio_memberships(
      id,
      studio_id,
      role,
      status,
      studio:studios(
        id,
        name,
        studio_status,
        profile:studio_profiles(
          commercial_name,
          city,
          address_line,
          geo_lat,
          geo_lng
        )
      )
    )
  `)
```

Filtro por rol:

- Platform owner: todos.
- Studio owner/manager: por `artist_studio_memberships.studio_id`.

Riesgo:

Supabase nested filters con relaciones pueden ser incomodos. Si se complica, crear RPC:

```txt
studio_flow_admin_get_artists()
```

que devuelva JSON ya normalizado por permisos.

## Clientes

Lectura base:

```txt
clients
profiles
client_profiles
customer_private_notes
```

Consulta ideal:

```js
supabase
  .from('clients')
  .select(`
    id,
    profile_id,
    display_name,
    email,
    phone,
    status,
    created_at,
    updated_at,
    profile:profiles(id, display_name, email, phone, status),
    client_profile:client_profiles(
      id,
      birthday,
      preferred_services,
      last_visit_at,
      next_recommended_visit_at
    )
  `)
```

Notas:

```js
supabase
  .from('customer_private_notes')
  .select('id, client_id, note, scope_type, studio_id, artist_id, membership_id, created_at')
```

Riesgo:

No existe relacion directa cliente-estudio. Para permisos scoped por estudio se necesita:

- usar appointments en fase posterior, o
- crear tabla de relacion cliente-estudio, o
- crear RPC que derive acceso por historial real.

## 7. Mutaciones Supabase recomendadas

## Artistas

### Activar/Inactivar

UI actual:

```txt
Inactivar / Activar
```

Mapeo:

```txt
Activo -> artists.status = 'active'
Inactivo -> artists.status = 'inactive' o 'suspended'
```

Nota:

Revisar enum `artist_status` antes de implementar. Si solo admite `active`, `inactive`, `suspended`, mapear exactamente a esos valores.

Flujo:

```txt
UI -> toggleManagedArtistStatus()
-> AppContext
-> adminCoreService.updateAdminArtistStatus()
-> Supabase update artists.status
-> setAdminState cache
```

### Editar artista

Campos 15.1:

```txt
Nombre -> artists.display_name
Ciudad -> artist_profiles.city
Descripcion -> artist_profiles.bio
Ubicacion artista -> artist_profiles.*
```

No migrar:

```txt
Plan
Servicios free text
Revenue
Studio location
```

Flujo:

```txt
UI -> saveArtistProfile()
-> AppContext.updateManagedArtistProfile()
-> adminCoreService.saveAdminArtistProfile()
-> update artists
-> upsert artist_profiles
-> setAdminState cache
```

## Clientes

### Activar/Inactivar

Mapeo:

```txt
Activo -> clients.status = 'active'
Inactivo -> clients.status = 'inactive'
```

Flujo:

```txt
UI -> toggleManagedClientStatus()
-> AppContext
-> adminCoreService.updateAdminClientStatus()
-> Supabase update clients.status
-> setAdminState cache
```

### Editar cliente

Campos 15.1:

```txt
Nombre -> clients.display_name, opcional profiles.display_name
Correo -> clients.email, cuidado con profiles.email/Auth
Telefono -> clients.phone, opcional profiles.phone
Notas -> customer_private_notes
```

No migrar:

```txt
Segmento
Spend
Appointments count
History
```

Flujo:

```txt
UI -> saveClientProfile()
-> AppContext.updateManagedClientProfile()
-> adminCoreService.saveAdminClientProfile()
-> update clients
-> maybe update profiles phone/display_name
-> upsert customer_private_notes
-> setAdminState cache
```

## 8. Mapa UI -> Context -> Service -> Supabase

### AdminArtists listar

```txt
AdminArtists.jsx render
-> useApp().adminState.artists actual
-> reemplazar por useApp().adminArtists o adminState.artists hidratado
-> AppContext.loadAdminArtists()
-> adminCoreService.fetchAdminArtists()
-> Supabase: artists + profiles + artist_profiles + artist_studio_memberships + studios + studio_profiles
```

### AdminArtists activar/inactivar

```txt
button Inactivar/Activar
-> toggleManagedArtistStatus(artist.id)
-> AppContext
-> adminCoreService.updateAdminArtistStatus({ artistId, status })
-> Supabase: update artists.status, updated_at
-> setAdminState cache
```

### AdminArtists editar perfil

```txt
button Guardar cambios
-> saveArtistProfile()
-> updateManagedArtistProfile(editingArtist.id, updates)
-> AppContext
-> adminCoreService.saveAdminArtistProfile({ artistId, updates })
-> Supabase: update artists, upsert artist_profiles
-> setAdminState cache
```

### AdminClients listar

```txt
AdminClients.jsx render
-> useApp().adminState.clients actual
-> reemplazar por useApp().adminClients o adminState.clients hidratado
-> AppContext.loadAdminClients()
-> adminCoreService.fetchAdminClients()
-> Supabase: clients + profiles + client_profiles + customer_private_notes
```

### AdminClients activar/inactivar

```txt
button Inactivar/Activar
-> toggleManagedClientStatus(client.id)
-> AppContext
-> adminCoreService.updateAdminClientStatus({ clientId, status })
-> Supabase: update clients.status, updated_at
-> setAdminState cache
```

### AdminClients editar perfil

```txt
button Guardar cambios
-> saveClientProfile()
-> updateManagedClientProfile(profileClient.id, profileClient)
-> AppContext
-> adminCoreService.saveAdminClientProfile({ clientId, updates })
-> Supabase: update clients, optional profiles, insert/update customer_private_notes
-> setAdminState cache
```

### AdminClients historial

Fase 15.1 recomendada:

```txt
Mantener demo o marcar read-only no migrado.
```

No tocar Agenda implica no construir historial real desde `appointments`.

## 9. Plan exacto de migracion

### Paso 1: crear service layer

Crear:

```txt
src/services/adminCoreService.js
```

Incluir:

```txt
fetchAdminArtists
fetchAdminClients
updateAdminArtistStatus
saveAdminArtistProfile
updateAdminClientStatus
saveAdminClientProfile
saveAdminCustomerNote
```

### Paso 2: crear mappers compatibles con UI

Crear mappers internos o archivo:

```txt
src/utils/adminCoreMapper.js
```

Mapear Supabase -> shape legacy:

Artist UI shape:

```js
{
  id,
  studioId,
  name,
  owner,
  city,
  plan,
  status: 'Activo' | 'Inactivo',
  studioStatus,
  description,
  services,
  revenue,
  professionalLocation,
}
```

Client UI shape:

```js
{
  id,
  studioId,
  name,
  email,
  phone,
  status: 'Activo' | 'Inactivo',
  segment,
  notes,
  history,
}
```

Campos no migrados deben quedar vacios o calculados, no inventados desde mock cuando hay sesion real.

### Paso 3: AppContext

Agregar estado:

```txt
isAdminCoreLoading
adminCoreError
```

Agregar loaders:

```txt
loadAdminArtists()
loadAdminClients()
loadAdminCore()
```

En `hydrateSupabaseSession()`:

```txt
si role admin/studio_owner/studio_manager:
  loadAdminCore()
```

Mantener:

```txt
adminState
```

como cache para compatibilidad, pero al cargar Supabase:

```txt
setAdminState(current => ({
  ...current,
  artists: mappedArtists,
  clients: mappedClients,
  studios: mappedStudios si fetchAdminArtists trae studios necesarios
}))
```

### Paso 4: reemplazar mutaciones internas

Cambiar implementacion, no API:

```txt
toggleManagedArtistStatus
updateManagedArtistProfile
toggleManagedClientStatus
updateManagedClientProfile
```

para que:

```txt
si sesion real admin -> Supabase -> cache
si demo/mock -> setAdminState local
```

### Paso 5: AdminArtists UI

Minimo cambio:

- seguir leyendo `adminState.artists`.
- mostrar loading/error si `isAdminCoreLoading/adminCoreError`.
- deshabilitar `Plan`, `Servicios`, `Revenue` o dejarlos como read-only si no hay columna.
- no tocar dashboard interno ni marketplace.

### Paso 6: AdminClients UI

Minimo cambio:

- seguir leyendo `adminState.clients`.
- mostrar loading/error.
- `Segmento`, `history`, `appointments`, `spend` quedan read-only/demo hasta migrar loyalty/appointments.
- `notes` se guarda en `customer_private_notes` o se oculta si no se implementa notas en 15.1.

### Paso 7: eliminar dependencia real de localStorage para esas pantallas

No borrar `localStorage` global.

Pero para sesion real:

```txt
Supabase debe sobreescribir adminState.artists/adminState.clients despues de hydrate.
```

## 10. Riesgos

### RLS / permisos

No se audito RLS en esta fase. Si RLS esta activa o se activa despues, Admin puede fallar aunque el codigo sea correcto.

Mitigacion:

- crear RPCs SECURITY DEFINER para Admin:

```txt
studio_flow_admin_get_artists
studio_flow_admin_get_clients
studio_flow_admin_update_artist_status
studio_flow_admin_update_client_status
```

### Relacion cliente-estudio no existe directa

`AdminClients` filtra por estudio, pero schema actual no tiene `client_studio_memberships`.

Mitigacion:

- fase 15.1 platform owner lista todos.
- studio owner/manager requiere derivar por `appointments` o crear tabla nueva.
- no tocar Agenda implica dejar filtro scoped limitado.

### Campos UI sin columna

AdminArtists:

```txt
plan
services free text
revenue
```

AdminClients:

```txt
segment
appointments
spend
history
```

Mitigacion:

- read-only o vacio.
- no rellenar desde mock en sesion real.

### Email de profiles/Auth

Editar email en AdminClients puede actualizar `clients.email`, pero `profiles.email` esta ligado a Auth/contexto.

Mitigacion:

- en 15.1 actualizar solo `clients.email`.
- flujo de cambio de email Auth queda fuera.

### Status enum mapping

UI usa:

```txt
Activo
Inactivo
```

DB usa enums en ingles:

```txt
active
inactive
suspended
archived
```

Mitigacion:

- mapper central `uiStatusToDbStatus` y `dbStatusToUiStatus`.

### AppContext muy cargado

Seguir agregando Admin logic a `AppContext.jsx` aumenta acoplamiento.

Mitigacion:

- service layer separado obligatorio.
- mapper separado recomendado.
- siguiente fase podria extraer `AdminContext`.

## 11. Alcance recomendado de Fase 15.1 implementacion

Implementar solo:

```txt
AdminArtists list
AdminArtists status
AdminArtists editar nombre/bio/ciudad/ubicacion artista
AdminClients list
AdminClients status
AdminClients editar nombre/email/telefono/notas
```

No implementar:

```txt
Nueva artista
Nueva clienta
Aprobacion/rechazo artista
Plan
Revenue
Servicios
Historial real
Segmento real
Appointments
Marketplace
Dashboard KPIs
Studio profile completo
```

## Veredicto

La migracion core Admin debe hacerse con un service layer nuevo y mappers de compatibilidad.

La estrategia mas segura es:

```txt
Supabase como fuente de verdad para AdminArtists/AdminClients
adminState como cache compatible
localStorage solo para demo
```

Esto permite migrar las dos pantallas pedidas sin romper Dashboard, Marketplace ni Agenda.
