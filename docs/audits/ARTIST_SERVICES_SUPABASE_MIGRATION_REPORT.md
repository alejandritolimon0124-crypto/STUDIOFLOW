# FASE 14.7 - ARTIST SERVICES SUPABASE MIGRATION

## Objetivo

Implementar persistencia real para Artist Services usando las tablas existentes de `milestone_03_services.sql`.

## Schema mapping

Tabla principal:

```txt
service_offerings
```

Mapping UI -> Supabase:

| UI | Supabase |
|---|---|
| `service.id` | `service_offerings.id` |
| `service.name` | `service_offerings.name` |
| `service.category` | `service_categories.name` + `service_offerings.category_id` |
| `service.price` | `service_offerings.price_amount` |
| `service.duration` (`"60 min"`) | `service_offerings.duration_minutes` |
| `service.status = "Activo"` | `service_offerings.status = "active"` |
| `service.status = "Suspendido"` | `service_offerings.status = "suspended"` |
| delete | `service_offerings.status = "archived"` + `archived_at` |
| `service.serviceTier` | `service_tiers.code` + `service_offerings.tier_id` |
| current artist | `owner_type = "artist"` + `artist_id = session.artist.id` |

Tablas utilizadas:

```txt
service_categories
service_tiers
service_offerings
```

## Service layer

Archivo creado:

```txt
src/services/artistServiceService.js
```

Funciones:

```js
fetchArtistServices({ artistId })
saveArtistServiceOffering({ artistId, service })
updateArtistServiceOfferingStatus({ serviceId, status })
archiveArtistServiceOffering({ serviceId })
```

Operaciones Supabase implementadas:

- `select` desde `service_offerings`
- `select` desde `service_categories`
- `select` desde `service_tiers`
- `upsert` de categorias por `slug`
- `upsert` de tiers por `code`
- `insert` de nuevos `service_offerings`
- `update` de servicios existentes
- `update` para suspender/activar
- `update` para archivar soft delete

No se usaron RPCs porque no existen RPCs de services actualmente en el repo. La integracion usa CRUD directo sobre las tablas existentes.

## Context integration

Archivo modificado:

```txt
src/contexts/AppContext.jsx
```

Se agrego cache de servicios en:

```js
artistState.services
```

Se expone por contexto:

```js
artistServices
isArtistServicesLoading
artistServicesError
loadArtistServices
saveArtistService
updateArtistServiceStatus
archiveArtistService
```

Al iniciar sesion como artista real:

```txt
hydrateSupabaseSession()
→ session.artist.id disponible
→ loadArtistServices(artistId)
→ fetchArtistServices()
→ setArtistState({ services })
```

Para sesion demo, se conserva fallback inicial desde `mockData` para no romper demo mode.

## UI integration

Archivo modificado:

```txt
src/pages/artist/ArtistServices.jsx
```

Antes:

```txt
mockData.artistServices
→ useState local
→ setServices()
→ se perdia al recargar
```

Ahora:

```txt
artistServices desde AppContext
→ saveArtistService()
→ Supabase service_offerings
→ AppContext actualiza cache
```

Acciones conectadas:

- Guardar servicio
- Actualizar servicio
- Suspender servicio
- Activar servicio
- Eliminar servicio como archive/soft delete

Se preservo la UI actual:

- mismo formulario
- mismas listas de activos/suspendidos
- mismo feedback visual
- mismos botones

## MockData reemplazado

Se dejo de consumir `artistServices` directamente desde `mockData` en:

```txt
src/pages/artist/ArtistServices.jsx
src/pages/artist/ArtistAppointments.jsx
src/pages/artist/ArtistDashboard.jsx
src/pages/client/ClientDashboard.jsx
src/pages/admin/AdminDashboard.jsx
```

`mockData.artistServices` queda solo como fallback inicial de `artistState.services` para modo demo.

## Persistencia resultante

Los servicios ahora sobreviven:

- logout
- reload
- cambio de dispositivo

porque la fuente de verdad de artistas reales es:

```txt
service_offerings
service_categories
service_tiers
```

El estado React/localStorage queda como cache y fallback demo, no como fuente final para artistas reales.

## Validacion

Comando ejecutado:

```bash
npm run build
```

Resultado:

```txt
vite build completed successfully
```

Advertencia no bloqueante:

```txt
Some chunks are larger than 500 kB after minification.
```

## Nota tecnica

La migracion usa CRUD directo porque el proyecto no tiene funciones RPC para services. Si despues se quiere encapsular permisos/logica en SQL, el siguiente paso natural seria crear RPCs:

```txt
studio_flow_get_artist_services
studio_flow_upsert_artist_service
studio_flow_update_artist_service_status
studio_flow_archive_artist_service
```

Por ahora, la UI ya esta desacoplada de `mockData.artistServices` y conectada a las tablas existentes.
