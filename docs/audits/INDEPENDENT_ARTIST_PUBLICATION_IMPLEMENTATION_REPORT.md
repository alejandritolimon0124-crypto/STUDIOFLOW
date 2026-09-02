# FASE 17.8C - INDEPENDENT ARTIST PUBLICATION IMPLEMENTATION

## Objetivo

Implementar publicacion real de artistas independientes en Marketplace.

Alcance aplicado:

- Readiness RPC.
- Publish RPC.
- Service Layer.
- AppContext.
- UI minima Platform Owner.
- Artist Layout sin dependencia semantica de `studio_status` para artistas sin studio.

No implementado:

- Booking.
- Availability.
- Cobranza.
- Comisiones.
- Governance Studio adicional.
- Marketplace para studios.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `supabase/migrations/202606110013_independent_artist_publication.sql` | Nueva migracion con readiness y publish RPC para artistas independientes. |
| `src/services/governanceService.js` | Agrega normalizadores y funciones de publicacion independiente. |
| `src/contexts/AppContext.jsx` | Agrega `publicationState`, loader de readiness y accion de publish. |
| `src/pages/admin/AdminArtists.jsx` | Agrega accion minima `Publicar artista` para Platform Owner en artistas independientes. |
| `src/layouts/ArtistLayout.jsx` | Evita banner `En validacion` cuando no hay studio y muestra estado de publicacion independiente. |

## Migracion SQL

Archivo:

`supabase/migrations/202606110013_independent_artist_publication.sql`

RPCs creadas:

| RPC | Uso |
|---|---|
| `studio_flow_admin_get_independent_artist_publication_readiness(p_artist_id uuid default null)` | Devuelve readiness, estado de publicacion, profile/listings existentes y faltantes. |
| `studio_flow_admin_publish_independent_artist(p_artist_id uuid, p_title text, p_summary text, p_city text)` | Publica un artista independiente creando/actualizando profile y listing visibles. |

Validaciones de publish:

- Auth session requerida.
- Rol `platform_owner` requerido.
- `artists.status = active`.
- `artist_profiles` existente.
- `artist_profiles.artistic_name` no vacio.
- Servicios activos `service_offerings.owner_type = artist`.

Escrituras de publish:

- `marketplace_profiles.profile_type = artist`.
- `marketplace_profiles.visibility_status = visible`.
- `marketplace_listings.visibility_status = visible`.
- `audit_events.context = marketplace`.
- `audit_events.event_type = independent_artist_published`.

## Service Layer

Archivo:

`src/services/governanceService.js`

Funciones agregadas:

```text
fetchIndependentArtistPublicationReadiness(artistId)
publishIndependentArtist({ artistId, title, summary, city })
```

El service normaliza a camelCase:

- `artist`
- `artistProfile`
- `activeServiceCount`
- `marketplaceProfile`
- `marketplaceListings`
- `publicationStatus`
- `canPublish`
- `missing`

## AppContext

Agregado:

```text
publicationState = {
  readinessByArtistId: {},
  loaded: false,
  lastPublication: null
}
```

Acciones:

```text
loadIndependentArtistPublicationReadiness()
publishIndependentArtistProfile()
```

Reglas:

- Artista real carga su readiness propia automaticamente.
- Platform Owner puede publicar artistas independientes.
- Publish refresca `loadAdminArtists()` y `loadGovernanceQueue()`.
- No se usa `adminState.studios` para decidir publicacion independiente.

## Platform Owner UI

Archivo:

`src/pages/admin/AdminArtists.jsx`

Se agrego boton:

```text
Publicar artista
```

Visible para:

```text
role = platform_owner
artist.studioId = null
artist.membershipId = null
artist.status = Activo
```

El boton llama:

```text
publishIndependentArtistProfile()
  -> studio_flow_admin_publish_independent_artist()
```

## Artist Dashboard / Layout

Archivo:

`src/layouts/ArtistLayout.jsx`

Cambio clave:

```text
si no hay studio/membership:
  no usar studio_status
  no mostrar En validacion
  mostrar estado de publicacion independiente
```

Estados mostrados:

| Estado | Copy |
|---|---|
| `visible` | `Publicado en Marketplace` |
| `suspended` | `Publicacion pausada` |
| default | `Perfil no publicado` |

## Validacion

Ejecutado:

```text
npm run build
```

Resultado:

- Build correcto.
- Vite compilo 139 modulos.
- PWA genero assets.
- Se mantiene advertencia existente de chunk mayor a 500 kB.

## Resultado esperado para Dennis

Antes:

```text
Marketplace = No hay perfiles publicados
NO marketplace_profile tipo artist
NO marketplace_listing visible
Artist Layout podia mostrar En validacion por fallback de studio
```

Despues de ejecutar `Publicar artista` como Platform Owner:

```text
marketplace_profiles.profile_type = artist
marketplace_profiles.artist_id = Dennis
marketplace_profiles.visibility_status = visible
marketplace_listings.artist_id = Dennis
marketplace_listings.visibility_status = visible
Marketplace Read devuelve Dennis
Artist Layout muestra Publicado en Marketplace
```

## Riesgos encontrados

| Riesgo | Estado |
|---|---|
| La migracion SQL no se valida con Vite | Pendiente de aplicar en Supabase para validacion DB real. |
| `marketplace_listings` no tiene unique por profile | La RPC evita duplicados reutilizando el ultimo listing existente. |
| Si un profile existente esta `suspended`, publish lanza error | Intencional para no levantar suspension accidentalmente. |
| UI de Platform Owner es minima | Cumple accion solicitada; una cola editorial queda para fase futura. |
| Artist Layout depende de readiness cargada | Si aun no cargo, muestra `Perfil no publicado` temporalmente. |

## Veredicto

La publicacion real de artistas independientes queda conectada.

Dennis ya no necesita studio aprobado para llegar a Marketplace. El camino real es:

```text
Platform Owner
  -> Publicar artista
  -> marketplace_profile artist visible
  -> marketplace_listing visible
  -> Marketplace Read
```
