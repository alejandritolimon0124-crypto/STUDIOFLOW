# FASE 17.7 - MARKETPLACE READ IMPLEMENTATION

## Objetivo

Implementar la primera reconexion real del Marketplace cliente contra Supabase.

Alcance aplicado:

- Solo lectura.
- No booking.
- No disponibilidad real.
- No comisiones.
- Fallback mock solo cuando `session.isMockSession = true`.

## Implementado

| Pieza | Resultado |
|---|---|
| RPC | `studio_flow_marketplace_get_listings()` |
| Service | `src/services/marketplaceService.js` |
| Estado | `marketplaceState` independiente de `adminState` |
| Loader | `loadMarketplaceListings()` para sesiones reales `client` |
| UI cliente | `ClientDashboard` usa `marketplaceListings` en sesiones reales |
| Empty state real | `No hay perfiles publicados` |
| Mock fallback | Conservado solo para sesiones mock |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `supabase/migrations/202606110011_marketplace_read.sql` | Nueva RPC read-only de Marketplace. |
| `src/services/marketplaceService.js` | Nuevo service para llamar y normalizar listings. |
| `src/contexts/AppContext.jsx` | Agrega `marketplaceState`, loader, loading/error y export del estado. |
| `src/pages/client/ClientDashboard.jsx` | Cambia fuente real de Marketplace desde `adminState.artists` a `marketplaceListings`. |

## RPC

Nueva funcion:

```text
studio_flow_marketplace_get_listings()
```

Lee:

- `marketplace_listings`
- `marketplace_profiles`
- `artists`
- `artist_profiles`
- `studios`
- `studio_profiles`
- `artist_studio_memberships`
- `service_offerings`
- `service_categories`
- `service_tiers`

Filtros aplicados:

- listing `visible`
- profile `visible`
- listing no expirado
- artist `active`
- studio no archivado/suspendido si existe
- al menos un `service_offering` activo

## AppContext

Se agrego:

```text
marketplaceState = {
  listings: [],
  loaded: false
}
```

Y:

```text
loadMarketplaceListings()
```

El loader solo corre si:

```text
session.isMockSession === false
session.role === client
```

Esto evita reutilizar `adminState.artists` en sesiones reales cliente.

## ClientDashboard

En sesion real:

```text
ClientDashboard
  -> marketplaceListings
  -> service_offerings normalizados
  -> empty state real si no hay listings
```

En sesion mock:

```text
ClientDashboard
  -> adminState.artists
  -> searchServices
  -> artistMarketplaceProfile
  -> getAvailableSlots local
```

Tambien se desactivo la disponibilidad local para sesiones reales:

```text
availableSlots = []
```

porque Availability Read no pertenece a esta fase.

## Decisiones

| Decision | Motivo |
|---|---|
| `marketplace_listings` es la fuente canonica | Evita exponer Admin Artists al cliente. |
| `service_offerings` alimenta filtros y dropdowns reales | El Marketplace ya no depende de `searchServices` en sesiones reales. |
| No se usa `availability_slots` todavia | Fase 17.7 es solo Marketplace Read. |
| No se toca `bookSlot()` | Booking Write queda para fase posterior. |
| Empty state real no cae a mock | Si Supabase devuelve 0 listings, se muestra estado real. |

## Validacion

Ejecutado:

```text
npm run build
```

Resultado:

- Build correcto.
- Vite compilo 138 modulos.
- PWA genero assets.
- Se mantiene advertencia existente de chunk mayor a 500 kB.

## Resultado esperado para Dennis

Dennis debe aparecer en Marketplace si existe un registro que cumpla:

```text
marketplace_listings.visibility_status = visible
marketplace_profiles.visibility_status = visible
artist.status = active
service_offerings.status = active
listing no expirado
```

Si `marketplace_listings = 0`, la UI real muestra:

```text
No hay perfiles publicados
```

## No implementado

- No se creo booking real.
- No se conecto disponibilidad real.
- No se escriben `appointments`.
- No se actualiza `availability_slots`.
- No se crean comisiones.
- No se reemplazo favoritos por `favorite_artists`.

## Veredicto

El Marketplace cliente ya no depende de `adminState.artists` en sesiones reales.

La primera reconexion read-only queda lista: los clientes reales consumen listings publicados desde Supabase y los mocks quedan limitados a sesiones mock.
