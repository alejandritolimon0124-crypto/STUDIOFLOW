# FASE 17.5B - MARKETPLACE ELIGIBILITY AUDIT

## Objetivo

Determinar exactamente que condicion usa el Marketplace cliente para mostrar u ocultar artistas, y por que no aparecen:

- Dennis Beauty Studio.
- Servicios de Dennis.

Este documento no implementa codigo, no crea SQL/RPC y no modifica archivos. Solo audita el flujo actual.

## Veredicto ejecutivo

El Marketplace cliente actual no es un marketplace Supabase real.

`ClientDashboard` no lee:

- `marketplace_profiles`
- `marketplace_listings`
- `service_offerings`
- RPC publica de marketplace

El Marketplace cliente renderiza desde:

```text
adminState.artists
  -> activeArtists
  -> marketplaceArtists
```

La causa principal de que Dennis no aparezca en una sesion real cliente es:

```text
adminState.artists esta vacio para role = client
```

porque despues de Fase 16.8C el estado admin real inicia vacio y `loadAdminArtists()` solo corre para:

```text
platform_owner
studio_owner
studio_manager
```

No corre para `client`.

Por tanto, aunque Dennis exista en `artists`, tenga `artists.status = active`, tenga `artist_profiles` y tenga `service_offerings` activos, `ClientDashboard` nunca llega a evaluarlo si la sesion es cliente real.

## 1. Flujo completo actual

```text
ClientDashboard
  -> useApp()
  -> adminState.artists
  -> activeArtists
  -> hydrateMarketplaceArtist()
  -> marketplaceArtists
  -> render resultados
```

Archivo:

`src/pages/client/ClientDashboard.jsx`

| Linea | Pieza | Funcion |
|---:|---|---|
| `415` | `adminState` | Fuente de artistas/studios. |
| `480-483` | `activeArtists` | Primer filtro de elegibilidad. |
| `614-637` | `marketplaceArtists` | Mapea, filtra por busqueda/servicio y ordena. |
| `929` | render resultados | Itera `marketplaceArtists`. |
| `1186-1193` | empty state | Muestra `Sin resultados disponibles` si la lista queda vacia. |

## 2. Fuente de datos por capa

### Frontend

`ClientDashboard` usa:

| Dato | Fuente |
|---|---|
| Artistas | `adminState.artists` |
| Studios | `adminState.studios` |
| Memberships | `deriveMembershipsFromLegacyData({ artists: adminState.artists })` |
| Servicios visibles | `artistMarketplaceProfile` local + fallback local |
| Search services | `searchServices` local |
| Disponibilidad | `getAvailableSlots()` local |

### AppContext

`adminState.artists` se llena por:

```text
loadAdminArtists()
  -> fetchAdminArtists()
  -> studio_flow_admin_get_artists()
```

Pero `loadAdminArtists()` tiene esta guarda:

`src/contexts/AppContext.jsx:1093-1095`

```js
if (session.isMockSession) return null
if (![ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER].includes(session.role)) return null
```

Y el efecto automatico tambien tiene la misma frontera:

`src/contexts/AppContext.jsx:1181-1185`

```js
if (session.isMockSession) return
if (![ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER].includes(session.role)) return

loadAdminArtists().catch(...)
```

Conclusion:

```text
role = client nunca carga adminState.artists desde Supabase.
```

### Service Layer

El unico service usado para poblar artistas reales es admin:

`src/services/adminArtistService.js`

| Funcion | RPC | Uso |
|---|---|---|
| `fetchAdminArtists()` | `studio_flow_admin_get_artists` | Admin artists/admin state. |

No existe service de marketplace cliente para artistas/listings.

### RPC

RPC existente:

`studio_flow_admin_get_artists`

Fuente:

`supabase/migrations/202606110006_admin_artists_wave_a.sql`

Lee:

- `artists`
- `artist_profiles`
- `profiles`
- `artist_studio_memberships`
- `studios`
- `studio_profiles`

No lee:

- `service_offerings`
- `marketplace_profiles`
- `marketplace_listings`

### Supabase

Tablas reales existen para marketplace:

`supabase/migrations/202606100008_milestone_08_marketplace.sql`

| Tabla | Estado en UI actual |
|---|---|
| `marketplace_profiles` | No se lee en `ClientDashboard`. |
| `marketplace_listings` | No se lee en `ClientDashboard`. |

## 3. Condiciones actuales de elegibilidad

### Condicion 1: existir en `adminState.artists`

Antes de cualquier filtro visual, el artista debe estar presente en:

```js
adminState.artists
```

Si `adminState.artists = []`, entonces:

```text
activeArtists = []
marketplaceArtists = []
Sin resultados disponibles
```

### Condicion 2: status frontend exacto

`src/pages/client/ClientDashboard.jsx:480-483`

```js
const activeArtists = adminState.artists.filter((artist) => {
  const artistStudio = getArtistStudio(artist)
  return artist.status === 'Activo' && canUseOperationalFeature(artistStudio || artist, 'publicAgenda')
})
```

El status esperado por frontend es:

```text
artist.status === 'Activo'
```

El mapper admin convierte:

`src/services/adminArtistService.js:3-7`

```js
active -> Activo
inactive -> Inactivo
archived -> Archivado
```

### Condicion 3: `publicAgenda` habilitado

`canUseOperationalFeature(artistStudio || artist, 'publicAgenda')`

Fuente:

`src/modules/governance/studioGovernance.js`

Regla:

```js
isStudioApproved(studio)
```

Solo si:

```text
studio.studioStatus === 'approved'
```

entonces `publicAgenda = true`.

Si no hay studio, o el studio no esta aprobado:

```text
publicAgenda = false
```

Por el fallback `artistStudio || artist`, un artista sin studio aprobado normalmente falla porque el `artist` no tiene `studioStatus = approved` salvo que venga asi mapeado.

### Condicion 4A: modo busqueda por servicio

Si:

```text
searchMode === 'Servicio'
```

se aplica:

`src/pages/client/ClientDashboard.jsx:631`

```js
return artist.marketplaceServices.includes(secondaryService)
```

`artist.marketplaceServices` no viene de Supabase. Viene de:

```js
hydrateMarketplaceArtist()
  -> getArtistMarketplaceProfile(artist)
  -> artistMarketplaceProfile[artist.id] || fallback
```

El fallback para cualquier id desconocido es:

`src/pages/client/ClientDashboard.jsx:212-216`

```js
{
  services: ['Lash lifting', 'Brow design'],
  occupancy: 64,
}
```

Eso significa:

- Los `service_offerings` reales de Dennis no participan.
- Si el usuario busca un servicio distinto a `Lash lifting` o `Brow design`, Dennis falla aunque tenga servicios activos reales.

### Condicion 4B: modo busqueda por nombre estudio

Si:

```text
searchMode === 'Nombre estudio'
```

se aplica:

```js
const searchable = `${artist.name} ${artist.owner} ${artist.city} ${artistStudio.profile?.commercialName || ''}`.toLowerCase()
return searchable.includes(studioQuery.toLowerCase())
```

Aqui Dennis podria pasar si:

- esta en `adminState.artists`;
- tiene `artist.name`, `artist.owner`, `artist.city` o `studioProfile.profile.commercialName` que contenga la busqueda;
- ya paso `activeArtists`.

## 4. Matriz Dennis

Artist ID auditado:

```text
ea078c9a-b939-4fe6-98e1-05a4d1488379
```

Datos validados por contexto:

| Condicion DB | Estado |
|---|---|
| Existe en `artists` | Cumple |
| `artists.status = active` | Cumple en DB |
| `artist_profiles` existe | Cumple |
| `service_offerings` activos existen | Cumple |
| `marketplace_listings = 0` | Confirmado |

Condiciones reales del Marketplace actual:

| Condicion UI | Fuente | Dennis |
|---|---|---|
| Estar en `adminState.artists` | AppContext/admin loader | Falla en sesion cliente real si `adminState.artists = []`. |
| `artist.status === 'Activo'` | Mapper admin | Cumpliria si el admin loader lo cargara. |
| `publicAgenda = true` | `studioStatus === 'approved'` | Indeterminado sin ver studio/membership; puede fallar si no hay studio aprobado. |
| Servicio seleccionado incluido en `artist.marketplaceServices` | lista local `artistMarketplaceProfile`/fallback | Solo cumple para `Lash lifting` o `Brow design` si id no esta hardcodeado. |
| Nombre coincide en modo `Nombre estudio` | string frontend | Solo se evalua si ya paso `activeArtists`. |

Primer fallo mas probable y suficiente:

```text
Dennis no esta en adminState.artists durante una sesion cliente real.
```

## 5. Por que Dennis no aparece

Hay dos razones, una estructural y otra de filtro:

### Razon estructural principal

`ClientDashboard` usa `adminState.artists`, pero `adminState` no se carga para clientes reales.

En Fase 16.8C se enforced que sesiones reales arranquen sin mock:

```text
artists: []
studios: []
clients: []
dashboard source supabase empty
```

Como el rol cliente no ejecuta `loadAdminArtists()`, el Marketplace cliente queda sin artistas:

```text
adminState.artists = []
activeArtists = []
marketplaceArtists = []
```

### Razon de filtro secundaria

Aunque Dennis estuviera en `adminState.artists`, sus servicios reales no se usan.

El filtro por servicio compara contra:

```text
artist.marketplaceServices
```

que viene de listas locales, no de `service_offerings`.

Por eso los servicios reales activos de Dennis no hacen que aparezca para busquedas de esos servicios.

## 6. `marketplace_listings`: obligatoria, opcional, legacy o abandonada

En el Marketplace cliente actual:

```text
marketplace_listings es abandonada/no conectada
```

Clasificacion:

| Opcion | Resultado |
|---|---|
| A) obligatoria | No para el UI actual, porque no se consulta. |
| B) opcional | No exactamente; existe en schema pero no participa. |
| C) legacy | No; parece infraestructura futura/real no conectada. |
| D) abandonada | Si en el flujo actual, porque la UI no la usa. |

Matiz:

Desde arquitectura producto, `marketplace_listings` deberia ser la fuente real del Marketplace. Pero hoy su conteo `0` no explica directamente el empty state, porque `ClientDashboard` no la consulta.

## 7. Condicion exacta de `Sin resultados disponibles`

Archivo:

`src/pages/client/ClientDashboard.jsx:1186-1193`

```js
{marketplaceArtists.length === 0 && (
  <div className="artist-result">
    <div>
      <strong>Sin resultados disponibles</strong>
      <small>Prueba otro servicio o nombre de estudio.</small>
    </div>
    <StatusPill tone="neutral">Marketplace</StatusPill>
  </div>
)}
```

La condicion exacta es:

```text
marketplaceArtists.length === 0
```

`marketplaceArtists` queda vacio si:

1. `adminState.artists` esta vacio.
2. Ningun artista tiene `status === 'Activo'`.
3. Ningun artista tiene `publicAgenda = true`.
4. En modo servicio, ningun artista tiene `artist.marketplaceServices.includes(secondaryService)`.
5. En modo nombre estudio, ninguno contiene `studioQuery`.

Para Dennis en sesion cliente real, el punto 1 es suficiente.

## 8. Respuesta directa

### ¿Marketplace lee `artists`?

Indirectamente si, pero solo mediante:

```text
adminState.artists
```

No llama una RPC marketplace/client.

### ¿Marketplace lee `artist_profiles`?

No directamente. Solo si `adminState.artists` ya fue armado por Admin Artists RPC y mapper.

### ¿Marketplace lee `service_offerings`?

No. Usa listas locales de nombres.

### ¿Marketplace lee `marketplace_profiles`?

No.

### ¿Marketplace lee `marketplace_listings`?

No.

### ¿Marketplace lee otra fuente?

Si:

- `artistMarketplaceProfile` local.
- `searchServices` local.
- `adminState.artists`.
- `adminState.studios`.
- `getAvailableSlots()` local.

## 9. Separacion por capa

### Frontend

`ClientDashboard` implementa el marketplace completo en el componente, sin service dedicado.

### AppContext

Expone `adminState`, pero no carga `adminState.artists` para `client`.

### Service Layer

No hay service marketplace cliente.

### RPC

No hay RPC marketplace cliente.

La unica RPC que podria alimentar artistas es admin:

```text
studio_flow_admin_get_artists
```

pero esta protegida conceptualmente para roles admin y no corre desde cliente.

### Supabase

Las tablas `marketplace_profiles` y `marketplace_listings` existen, pero estan desconectadas del UI cliente.

## Veredicto

Dennis no aparece porque el Marketplace cliente no esta conectado al marketplace real.

La primera condicion que falla en sesion cliente real es:

```text
adminState.artists contiene 0 artistas
```

Aunque Dennis existe en Supabase, `ClientDashboard` no lo consulta por `artists`, `artist_profiles`, `service_offerings`, `marketplace_profiles` ni `marketplace_listings`.

La solucion futura no deberia ser reusar `loadAdminArtists()` para clientes, sino crear una fuente marketplace real:

```text
marketplace_listings / marketplace_profiles
  + artists
  + artist_profiles
  + service_offerings
  + availability_slots
  -> service/RPC de Marketplace cliente
  -> ClientDashboard
```

