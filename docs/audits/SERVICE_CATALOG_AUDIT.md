# FASE 14.7C - SERVICE CATALOG AUDIT

## Resumen ejecutivo

StudioFlow tiene un catalogo persistido en Supabase para servicios reales de artista, pero todavia convive con varios catalogos locales/hardcoded que alimentan busqueda, marketplace, booking, formularios y reglas de loyalty.

Fuente canonica actual para servicios guardados:

```txt
service_categories
service_tiers
service_offerings
```

Fuentes locales todavia activas:

```txt
src/services/mockData.js -> artistServices
src/services/mockData.js -> serviceCatalog
src/pages/client/ClientDashboard.jsx -> searchServices
src/pages/client/ClientDashboard.jsx -> artistMarketplaceProfile.services
src/modules/loyalty/flowPointsEngine.js -> serviceTierPoints
src/contexts/AppContext.jsx -> artistState.services cache/localStorage
src/pages/admin/AdminArtists.jsx -> editingArtist.services free text
```

No se encontraron definiciones exactas con estos nombres:

```txt
serviceCategories
serviceSubcategories
serviceSuggestions
```

Sus equivalentes funcionales son:

- `serviceCatalog` keys como categorias.
- `serviceCatalog[category]` como subcategorias/opciones.
- `searchServices[primaryService]` como sugerencias de busqueda/booking.
- `artistMarketplaceProfile.services` como servicios publicados demo por artista.

## 1. Supabase service catalog

### Schema

Archivo:

```txt
supabase/migrations/202606100003_milestone_03_services.sql
```

Lineas aproximadas:

```txt
26  service_categories
40  service_tiers
54  service_offerings
```

Tipo:

```txt
Supabase
```

Contenido:

- `service_categories`: categorias normalizadas por `slug` y `name`.
- `service_tiers`: tiers normalizados por `code`, `label`, `default_points`.
- `service_offerings`: servicios ofrecidos por artista/estudio/membresia.

Consumidores:

```txt
src/services/artistServiceService.js
```

Operaciones:

- `select` categorias y tiers: lineas aproximadas 82 y 92.
- `select` offerings: linea aproximada 108.
- `upsert` categorias: linea aproximada 126.
- `upsert` tiers: linea aproximada 138.
- `insert/update` offerings: lineas aproximadas 175-176.
- `update` status: linea aproximada 193.
- `archive` soft delete: linea aproximada 214.

Duplicacion:

Si. Duplica conceptualmente con:

- `mockData.serviceCatalog`
- `ClientDashboard.searchServices`
- `flowPointsEngine.serviceTierPoints`
- `artistMarketplaceProfile.services`

Estado:

```txt
PARCIALMENTE CONSOLIDADO
```

Es la fuente real de servicios guardados, pero no alimenta aun todos los catalogos de UI.

## 2. `mockData.artistServices`

Archivo:

```txt
src/services/mockData.js
```

Linea aproximada:

```txt
162
```

Tipo:

```txt
MockData
```

Contenido:

Tres servicios demo:

- `Lash lifting`
- `Brow design`
- `Soft glam makeup`

Campos:

```txt
name
category
price
duration
bookings
demand
status
serviceTier
```

Consumidores actuales:

```txt
src/contexts/AppContext.jsx
```

Lineas aproximadas:

```txt
3    import como mockArtistServices
434  fallback inicial de artistState.services
1504 expone artistServices desde artistState.services
```

Despues de Fase 14.7, las paginas ya no lo importan directamente para la lista principal. Queda como fallback demo/cache inicial.

Supabase:

```txt
No
```

Duplicacion:

Si. Duplica servicios reales que ahora viven en `service_offerings`.

Needs consolidation:

```txt
Si
```

Debe quedar solo como seed/demo fallback o eliminarse del flujo autenticado real.

## 3. `mockData.serviceCatalog`

Archivo:

```txt
src/services/mockData.js
```

Linea aproximada:

```txt
168
```

Tipo:

```txt
MockData / hardcoded taxonomy
```

Contenido:

Categorias y opciones de servicio para el formulario de artista:

- `Colocacion de Unas`
- `Colocacion de Pestanas`
- `Maquillaje`
- `Manicure`
- `Pedicure`
- `Microblading`
- `Faciales`
- `Depilado`

Consumidores:

```txt
src/pages/artist/ArtistServices.jsx
```

Lineas aproximadas:

```txt
8    import { serviceCatalog }
22   primaryServices = Object.keys(serviceCatalog)
24   secondary inicial
37   cambio de categoria
42   reset de formulario
54   edicion de servicio existente
136  opciones del select secundario
```

Supabase:

```txt
No
```

Duplicacion:

Si. Duplica:

- `service_categories.name`
- nombres de servicios que terminan en `service_offerings.name`
- `ClientDashboard.searchServices`

Needs consolidation:

```txt
Si
```

Debe migrarse a una lectura desde `service_categories` y, si se necesita catalogo de plantillas/subcategorias, crear una tabla o vista explicita para templates de servicios.

## 4. `ClientDashboard.searchServices`

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Linea aproximada:

```txt
22
```

Tipo:

```txt
Hardcoded marketplace/search catalog
```

Contenido:

Taxonomia de busqueda para cliente. Cada entrada incluye:

```txt
name
durationMinutes
```

Consumidores:

```txt
src/pages/client/ClientDashboard.jsx
```

Lineas aproximadas:

```txt
123  allSearchServices = Object.values(searchServices).flat()
430  secondaryService inicial desde searchServices.Pestanas
434  marketplaceService por allSearchServices/searchServices
885  cambio de servicio primario
888  opciones de servicio primario
891  contador de opciones
903  opciones de servicio secundario
1099 opciones de booking desde marketplaceServices + allSearchServices
1372 opciones de booking/public profile desde marketplaceServices + allSearchServices
```

Supabase:

```txt
No
```

Duplicacion:

Si. Duplica:

- `mockData.serviceCatalog`
- `service_categories`
- `service_offerings.name`
- duraciones reales en `service_offerings.duration_minutes`

Needs consolidation:

```txt
Si
```

El marketplace deberia buscar servicios publicados/activos desde `service_offerings` y usar `duration_minutes` real, no duraciones hardcoded.

## 5. `ClientDashboard.allSearchServices`

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Linea aproximada:

```txt
123
```

Tipo:

```txt
Derived hardcoded catalog
```

Contenido:

Lista plana derivada de:

```js
Object.values(searchServices).flat()
```

Consumidores:

```txt
src/pages/client/ClientDashboard.jsx
```

Lineas aproximadas:

```txt
434  resolver marketplaceService
1099 resolver durationMinutes para booking
1372 resolver durationMinutes para booking/public profile
```

Supabase:

```txt
No
```

Duplicacion:

Si. Es una derivacion directa de `searchServices`.

Needs consolidation:

```txt
Si
```

Debe desaparecer si `searchServices` se reemplaza por una consulta real.

## 6. `ClientDashboard.artistMarketplaceProfile.services`

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Lineas aproximadas:

```txt
108  artist-1 services
114  artist-2 services
118  artist-3 services
214  fallback services en public profile
235  marketplaceServices: profile.services
```

Tipo:

```txt
Hardcoded marketplace artist catalog
```

Contenido:

Listas hardcoded de servicios por artista demo:

- `Lash lifting`
- `Brow design`
- `Laminado de ceja`
- `Soft glam makeup`
- `Acrilicas`
- `Gelish`
- `Nail art`
- `Facial glow`
- etc.

Consumidores:

```txt
src/pages/client/ClientDashboard.jsx
```

Lineas aproximadas:

```txt
625  filtro por secondaryService
671  seleccion inicial al abrir artista
957  cards marketplace
1022 chips de perfil publico
1099 booking options
1231 cards/listado alterno
1295 chips de perfil publico alterno
1372 booking options alterno
```

Supabase:

```txt
No
```

Duplicacion:

Si. Duplica:

- `service_offerings` por artista.
- `searchServices`.
- `mockData.serviceCatalog`.

Needs consolidation:

```txt
Si
```

Debe reemplazarse por servicios activos/publicados del artista desde `service_offerings`.

## 7. `AppContext.artistState.services`

Archivo:

```txt
src/contexts/AppContext.jsx
```

Lineas aproximadas:

```txt
434  services inicial desde mockArtistServices
876  loadArtistServices llama fetchArtistServices
1262 saveArtistService
1285 updateArtistServiceStatus
1307 archiveArtistService
1504 expose artistServices
```

Tipo:

```txt
Cache local de Supabase + fallback demo
```

Consumidores:

```txt
src/pages/artist/ArtistServices.jsx
src/pages/artist/ArtistAppointments.jsx
src/pages/artist/ArtistDashboard.jsx
src/pages/client/ClientDashboard.jsx
src/pages/admin/AdminDashboard.jsx
```

Supabase:

```txt
Si, cuando hay sesion real de artista y loadArtistServices() corre correctamente.
```

Mock/localStorage:

```txt
Si, para estado inicial y fallback demo.
```

Duplicacion:

Parcial. Es la cache de `service_offerings`, pero puede iniciar desde `mockArtistServices` y persistirse en `localStorage`.

Needs consolidation:

```txt
Parcial
```

Esta bien como cache, pero la sesion real debe seguir tratando Supabase como fuente final.

## 8. `flowPointsEngine.serviceTierPoints`

Archivo:

```txt
src/modules/loyalty/flowPointsEngine.js
```

Lineas aproximadas:

```txt
56  serviceTierPoints
78  fallback basic
81  lookup por serviceTier
```

Tipo:

```txt
Hardcoded loyalty tier catalog
```

Contenido:

Reglas locales de puntos por tier:

```txt
basic
medium
premium
vip
```

Consumidores:

```txt
src/modules/loyalty/flowPointsEngine.js
src/pages/artist/ArtistDashboard.jsx
src/pages/client/ClientDashboard.jsx
```

Supabase:

```txt
No
```

Duplicacion:

Si. Duplica conceptualmente `service_tiers.default_points`.

Needs consolidation:

```txt
Si
```

Las reglas de puntos deberian leerse desde `service_tiers` o desde un read model de loyalty para no duplicar `serviceTier`.

## 9. `AdminArtists editingArtist.services`

Archivo:

```txt
src/pages/admin/AdminArtists.jsx
```

Linea aproximada:

```txt
268
```

Tipo:

```txt
Local/free text
```

Contenido:

Campo editable de servicios como texto libre para artistas administrados.

Origen:

```txt
adminState.artists
```

Relacionado con:

```txt
src/contexts/AppContext.jsx lineas aproximadas 310 y createInitialAdminState()
src/services/mockData.js managedArtists[].specialties
```

Supabase:

```txt
No
```

Duplicacion:

Si. Duplica una descripcion de servicios/especialidades que deberia derivarse de `service_offerings` o `artist_profiles.specialties`.

Needs consolidation:

```txt
Si
```

Debe decidirse si admin muestra `artist_profiles.specialties`, resumen de `service_offerings`, o ambos.

## 10. `AdminDashboard` service/serviceTier demo metrics

Archivo:

```txt
src/pages/admin/AdminDashboard.jsx
```

Lineas aproximadas:

```txt
54
73
92
111
147 artistServices desde useApp()
235 generateOwnerDashboardSummary(accessibleAppointments, artistServices)
```

Tipo:

```txt
Mixto
```

Contenido:

- Eventos/riesgos demo con `service` y `serviceTier`.
- Summary usa `artistServices` desde AppContext, que puede venir de Supabase o fallback.

Supabase:

```txt
Parcial, solo por artistServices cuando hay cache real.
```

Duplicacion:

Si. Los eventos demo contienen nombres/tier sin garantizar que existan en `service_offerings`.

Needs consolidation:

```txt
Si, cuando admin metrics se migren a datos reales.
```

## 11. Booking/Appointments service references

Archivos:

```txt
src/pages/artist/ArtistAppointments.jsx
src/pages/artist/ArtistDashboard.jsx
src/pages/client/ClientDashboard.jsx
supabase/migrations/202606100005_milestone_05_appointments.sql
```

Lineas aproximadas:

```txt
ArtistAppointments.jsx 18-31 usa artistServices para opciones
ArtistDashboard.jsx 77-101 y 427 usa artistServices para opciones
ClientDashboard.jsx 1099 y 1372 usa marketplaceServices/searchServices para booking cliente
milestone_05_appointments.sql 77 appointment.service_offering_id
```

Tipo:

```txt
Mixto
```

Supabase esperado:

```txt
appointments.service_offering_id -> service_offerings.id
```

Estado actual:

- Artist booking interno ya usa `artistServices` de AppContext para opciones.
- Client marketplace booking todavia usa `artistMarketplaceProfile.services` y `searchServices`.
- La migracion real de appointments no esta completa en esta auditoria.

Needs consolidation:

```txt
Si
```

Booking cliente debe elegir un `service_offering_id` real, no solo un nombre.

## Matriz

| Catalog Source | Consumers | Supabase or Mock | Needs Consolidation |
|---|---|---|---|
| `service_categories` / `service_tiers` / `service_offerings` | `artistServiceService`, `AppContext.artistServices`, paginas que consumen `artistServices` | Supabase | Si, debe ser canonico para todo el catalogo |
| `src/services/mockData.js -> artistServices` | `AppContext` fallback inicial | MockData | Si, dejar solo demo/seed |
| `src/services/mockData.js -> serviceCatalog` | `ArtistServices.jsx` formulario de categoria/servicio | MockData | Si, reemplazar por catalogo Supabase/templates |
| `ClientDashboard.jsx -> searchServices` | Marketplace cliente, search, filtros, booking duration lookup | Hardcoded mock | Si, reemplazar por offerings publicados |
| `ClientDashboard.jsx -> allSearchServices` | Marketplace duration lookup y opciones derivadas | Derived mock | Si, desaparece al migrar `searchServices` |
| `ClientDashboard.jsx -> artistMarketplaceProfile.services` | Cards marketplace, perfil publico, booking options | Hardcoded mock | Si, reemplazar por `service_offerings` activos/publicados |
| `AppContext.jsx -> artistState.services` | ArtistServices, ArtistDashboard, ArtistAppointments, ClientDashboard, AdminDashboard | Cache Supabase + localStorage/demo fallback | Parcial, cache valida pero Supabase debe ganar |
| `flowPointsEngine.js -> serviceTierPoints` | Loyalty points y economia de citas | Hardcoded rules | Si, alinear con `service_tiers.default_points` |
| `AdminArtists.jsx -> editingArtist.services` | Admin artistas | Local/free text | Si, definir fuente: profile specialties u offerings |
| `AdminDashboard.jsx -> service/serviceTier demo events` | Admin risk/owner dashboard | Mixto/demo | Si, cuando admin metrics sean reales |
| `appointments.service_offering_id` | Booking futuro/appointments DB | Supabase schema | Si, UI cliente aun no escribe IDs reales |

## Datos que ya leen Supabase

### Servicios reales de artista

Ruta:

```txt
hydrateSupabaseSession()
-> loadArtistServices(artistId)
-> fetchArtistServices({ artistId })
-> service_offerings + service_categories + service_tiers
-> artistState.services
-> artistServices context
```

Componentes que pueden recibir esta cache real:

```txt
ArtistServices.jsx
ArtistAppointments.jsx
ArtistDashboard.jsx
ClientDashboard.jsx
AdminDashboard.jsx
```

## Datos que todavia vienen de mock/hardcoded

- Form taxonomy en `ArtistServices.jsx`: `mockData.serviceCatalog`.
- Search/marketplace taxonomy en `ClientDashboard.jsx`: `searchServices`.
- Servicios publicados de artistas demo en `ClientDashboard.jsx`: `artistMarketplaceProfile.services`.
- Duracion de servicios en marketplace cliente: `searchServices[].durationMinutes`.
- Puntos por tier: `flowPointsEngine.serviceTierPoints`.
- Descripcion admin de servicios: `AdminArtists editingArtist.services`.

## Datos que duplican otro catalogo

### `serviceCatalog` duplica `service_categories`

`serviceCatalog` contiene categorias de alto nivel que ahora tambien pueden existir en `service_categories`.

### `searchServices` duplica `serviceCatalog`

Ambos modelan categorias y servicios para belleza, pero con nombres y granularidad distintos.

### `artistMarketplaceProfile.services` duplica `service_offerings`

El marketplace deberia mostrar los servicios activos del artista desde Supabase.

### `serviceTierPoints` duplica `service_tiers.default_points`

La tabla ya tiene campo `default_points`, pero el motor de loyalty usa reglas locales.

## Veredicto

El catalogo esta **parcialmente migrado**.

La persistencia de servicios de artista ya esta en Supabase mediante:

```txt
service_offerings
service_categories
service_tiers
```

Pero el catalogo de seleccion, busqueda, marketplace y reglas sigue repartido en mocks/hardcoded:

```txt
serviceCatalog
searchServices
artistMarketplaceProfile.services
serviceTierPoints
admin free-text services
```

## Recomendacion de consolidacion

Orden recomendado:

1. Convertir `service_categories` + `service_tiers` + `service_offerings` en fuente canonica unica.
2. Reemplazar `ArtistServices.jsx -> serviceCatalog` por una lectura de categorias/templates desde Supabase.
3. Reemplazar `ClientDashboard.jsx -> searchServices` por servicios publicados/activos desde `service_offerings`.
4. Reemplazar `artistMarketplaceProfile.services` por offerings reales del artista.
5. Cambiar booking cliente para guardar `service_offering_id`.
6. Alinear `flowPointsEngine.serviceTierPoints` con `service_tiers.default_points`.
7. Reemplazar admin free-text `services` por resumen derivado de `artist_profiles.specialties` y/o `service_offerings`.

La primera consolidacion que evita mas trabajo duplicado es:

```txt
Marketplace/Search -> service_offerings activos/publicados
```

porque desbloquea a la vez:

- busqueda cliente
- perfil publico de artista
- booking con `service_offering_id`
- duraciones/precios reales
- base para loyalty por tier real
