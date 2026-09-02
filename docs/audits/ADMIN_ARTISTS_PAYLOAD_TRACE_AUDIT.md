# FASE 16.2D - ADMIN ARTISTS PAYLOAD TRACE AUDIT

## Objetivo

Determinar en que capa desaparece Dennis dentro del flujo Admin Artists:

```text
RPC -> service -> mapper -> adminState -> UI
```

Este documento no implementa codigo, no crea SQL y no modifica UI. Solo auditoria.

## Contexto

- Dennis existe en `profiles`.
- Dennis existe en `artists`.
- Dennis existe en `artist_profiles`.
- Dennis es artista independiente.
- Dennis no tiene `artist_studio_memberships`.
- Dennis no aparece en Admin Artists.
- La auditoria previa concluyo que `platform_owner` deberia verlo si la RPC local actual devuelve todos los artistas globales.

## Resumen ejecutivo

No hay evidencia de que `adminArtistService.js`, `mapAdminArtistsPayload()` o `AppContext.loadAdminArtists()` filtren a Dennis si viene en `data.artists`.

El punto donde Dennis puede desaparecer depende de si llega o no desde la RPC:

| Capa | ¿Puede eliminar a Dennis? | Resultado |
|---|---|---|
| RPC | Si | Si `v_is_platform_owner` no es true o la RPC desplegada difiere, Dennis no entra a `v_artist_ids`. |
| Service layer | No | `fetchAdminArtists()` solo llama RPC y pasa a mapper. |
| Mapper | No | `artists.map(...)` transforma todos los artistas recibidos; tolera `membership = null`. |
| AppContext | No | `loadAdminArtists()` asigna `payload.artists` directo a `adminState.artists`. |
| UI | Si | Si `isPlatformOwner` es false, `accessibleArtists` se calcula por studios/memberships y excluye independientes. |

Conclusion practica:

- Si Dennis no esta en `adminState.artists`, desaparece en la RPC.
- Si Dennis si esta en `adminState.artists` pero no se renderiza, desaparece en la UI, especificamente en el calculo de `accessibleArtists`.

## Flujo exacto

### 1. RPC

Archivo:

`supabase/migrations/202606110006_admin_artists_wave_a.sql`

Funcion:

`studio_flow_admin_get_artists()`

Punto critico:

```sql
select coalesce(array_agg(distinct a.id), '{}'::uuid[])
into v_artist_ids
from artists a
left join artist_studio_memberships asm on asm.artist_id = a.id
where v_is_platform_owner
  or (
    asm.studio_id = any(v_scoped_studio_ids)
    and asm.status <> 'archived'
  );
```

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `60-68` | Construye `v_artist_ids`. |
| `64` | Si `v_is_platform_owner` es true, incluye todos los artistas. |
| `66-67` | Si no es platform owner, exige membership scoped no archivada. |
| `86-87` | Solo devuelve artistas cuyo id esta en `v_artist_ids`. |
| `124-125` | Solo devuelve artist_profiles cuyo artist_id esta en `v_artist_ids`. |
| `228-233` | Retorna `artists`, `artist_profiles`, `profiles`, `memberships`, `studios`. |

Diagnostico:

- Para `platform_owner` real, Dennis deberia entrar en `v_artist_ids`.
- Para `studio_owner`/`studio_manager`, Dennis no entra porque no tiene `artist_studio_memberships`.

Linea exacta donde se pierde si la perdida ocurre en RPC scoped:

```sql
asm.studio_id = any(v_scoped_studio_ids)
```

en `supabase/migrations/202606110006_admin_artists_wave_a.sql:66`.

## 2. Service layer

Archivo:

`src/services/adminArtistService.js`

Funcion:

```js
export async function fetchAdminArtists() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_artists')

  if (error) throw error

  return mapAdminArtistsPayload(data)
}
```

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `131-133` | Llama `studio_flow_admin_get_artists`. |
| `135` | Solo corta si hay error. |
| `137` | Pasa todo `data` a `mapAdminArtistsPayload(data)`. |

Diagnostico:

El service layer no filtra artistas. Si Dennis viene en `data.artists`, pasa al mapper.

## 3. Mapper

Archivo:

`src/services/adminArtistService.js`

Funcion:

`mapAdminArtistsPayload(data)`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `104` | Lee `data.artists` si es array. |
| `105-108` | Lee perfiles, profiles, memberships y studios. |
| `110` | Indexa `artist_profiles` por `artist_id`; no filtra artistas. |
| `117-123` | Hace `artists.map(...)` para todos los artistas recibidos. |

Funcion interna:

`mapArtist(...)`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `71` | Busca `artistProfile` por `artist.id`. |
| `73` | Busca primera membership. Puede devolver null. |
| `74` | Si no hay membership, `studio = null`. |
| `81-82` | `studioId` y `membershipId` quedan null. |
| `84` | `city` usa `artistProfile.city` antes que studio. |
| `85` | `plan` cae a `'Artist'` si no hay membership. |
| `87` | `studioStatus` cae a `'pending'` si no hay studio. |
| `98` | `memberships` queda `[]` si no hay membership. |

Diagnostico:

El mapper esta preparado para artistas independientes. No elimina a Dennis por falta de membership.

Si Dennis entra a `mapAdminArtistsPayload(data).artists`, sale como:

```js
{
  id: dennisArtistId,
  studioId: null,
  membershipId: null,
  plan: 'Artist',
  studioStatus: 'pending',
  memberships: []
}
```

## 4. AppContext

Archivo:

`src/contexts/AppContext.jsx`

Funcion:

`loadAdminArtists()`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `909` | Define `loadAdminArtists`. |
| `910` | No carga si es mock session. |
| `911` | Solo carga para `platform_owner`, `studio_owner`, `studio_manager` segun `session.role`. |
| `917` | Recibe `payload = await fetchAdminArtists()`. |
| `918-921` | Escribe `artists: payload.artists` directo en `adminState`. |

Codigo clave:

```js
setAdminState((currentState) => ({
  ...currentState,
  artists: payload.artists,
  studios: payload.studios.length > 0 ? payload.studios : currentState.studios,
}))
```

Diagnostico:

AppContext no filtra a Dennis. Si Dennis esta en `payload.artists`, queda en `adminState.artists`.

La unica forma de que AppContext no lo cargue es:

1. `session.isMockSession` es true.
2. `session.role` no esta en `[platform_owner, studio_owner, studio_manager]`.
3. `fetchAdminArtists()` devuelve payload sin Dennis.
4. `fetchAdminArtists()` falla y conserva estado anterior.

## 5. AdminArtists UI

Archivo:

`src/pages/admin/AdminArtists.jsx`

### Resolucion de platform owner

Lineas `37-38`:

```js
const normalizedRole = session.user?.role === 'admin' ? ROLES.PLATFORM_OWNER : session.user?.role
const isPlatformOwner = normalizedRole === ROLES.PLATFORM_OWNER
```

Riesgo:

La pantalla usa `session.user?.role`, no `session.role`.

Si `session.role` es `platform_owner` pero `session.user.role` esta ausente, stale, o no coincide, entonces `isPlatformOwner` queda false.

### Derivacion de memberships desde artistas

Lineas `39-40`:

```js
const artistStudioMemberships = useMemo(
  () => deriveMembershipsFromLegacyData({ artists: adminState.artists }),
  [adminState.artists],
)
```

La funcion `deriveMembershipsFromLegacyData` esta en:

`src/modules/entities/entitySelectors.js:19-28`

Solo crea memberships si el artista tiene `artist.studioId`:

```js
.filter((artist) => artist?.id && artist?.studioId)
```

Dennis, por independiente, tiene `studioId = null`, asi que no genera membership derivada.

### Calculo de artistas accesibles

Lineas `60-70`:

```js
const accessibleArtists = useMemo(
  () => (
    isPlatformOwner
      ? adminState.artists
      : uniqueById(accessibleStudioIds.flatMap((studioId) => getArtistsForStudio({
        studioId,
        artists: adminState.artists,
        artistStudioMemberships,
      })))
  ),
  [accessibleStudioIds, adminState.artists, artistStudioMemberships, isPlatformOwner],
)
```

Comportamiento:

- Si `isPlatformOwner = true`, Dennis se conserva porque usa `adminState.artists`.
- Si `isPlatformOwner = false`, Dennis se pierde porque se busca por `getArtistsForStudio(...)` y no tiene membership/studio.

Linea exacta donde se pierde en UI:

```js
: uniqueById(accessibleStudioIds.flatMap((studioId) => getArtistsForStudio({
```

en `src/pages/admin/AdminArtists.jsx:64`.

La exclusion material ocurre porque:

- `deriveMembershipsFromLegacyData` no crea membership para Dennis en `entitySelectors.js:21`.
- `accessibleArtists` usa `getArtistsForStudio` en `AdminArtists.jsx:64-68`.

### Filtro de busqueda

Lineas `73-79`:

```js
const filteredArtists = useMemo(
  () =>
    accessibleArtists.filter((artist) => {
      const searchable = `${artist.name} ${artist.owner} ${artist.city} ${artist.plan}`.toLowerCase()
      return searchable.includes(query.toLowerCase())
    }),
  [accessibleArtists, query],
)
```

Este filtro solo elimina si el search query no coincide. Con `query = ''`, no elimina a Dennis.

### Render

Lineas `203-215`:

```js
{filteredArtists.map((artist) => (
  ...
))}
```

La UI renderiza lo que llegue a `filteredArtists`; no hay otro filtro en render.

## Respuesta: ¿donde desaparece Dennis?

Con base en el codigo local:

### Si Dennis no esta en `adminState.artists`

Desaparece en la RPC.

Linea probable:

```sql
asm.studio_id = any(v_scoped_studio_ids)
```

`supabase/migrations/202606110006_admin_artists_wave_a.sql:66`

Eso implica que la sesion no esta siendo tratada como `platform_owner` dentro de la RPC, o que la RPC desplegada no coincide con el archivo local.

### Si Dennis si esta en `adminState.artists`

Desaparece en la UI.

Linea exacta:

```js
: uniqueById(accessibleStudioIds.flatMap((studioId) => getArtistsForStudio({
```

`src/pages/admin/AdminArtists.jsx:64`

Causa:

`isPlatformOwner` quedo false en `AdminArtists.jsx:38`, y Dennis no tiene `studioId`, por lo que no genera membership derivada ni puede salir de `getArtistsForStudio`.

## Tabla de traza

| Capa | Archivo | Linea | Manejo de Dennis independiente | ¿Lo puede perder? |
|---|---|---:|---|---|
| RPC | `202606110006_admin_artists_wave_a.sql` | `60-68` | Incluye si `v_is_platform_owner`; excluye si requiere membership scoped. | Si |
| Service | `adminArtistService.js` | `131-137` | Pasa payload completo al mapper. | No |
| Mapper | `adminArtistService.js` | `117-123` | Mapea todos los artistas recibidos. | No |
| Mapper artist | `adminArtistService.js` | `73-87` | Tolera `membership = null`. | No |
| AppContext | `AppContext.jsx` | `917-921` | Escribe `payload.artists` directo. | No |
| UI role | `AdminArtists.jsx` | `37-38` | Determina si usa vista global o scoped. | Si |
| UI memberships | `entitySelectors.js` | `21` | Excluye artistas sin `studioId` de memberships derivadas. | Si indirecto |
| UI accessibleArtists | `AdminArtists.jsx` | `63-68` | Si no es platform owner, solo artistas por studio. | Si |
| UI search | `AdminArtists.jsx` | `73-79` | Filtra por query. | Solo si query no coincide |
| UI render | `AdminArtists.jsx` | `203` | Renderiza `filteredArtists`. | No |

## Verificacion manual recomendada

Para saber la capa exacta en runtime, revisar estos valores en orden:

1. Resultado raw de RPC:

```js
const { data } = await supabase.rpc('studio_flow_admin_get_artists')
data.artists.some((artist) => artist.id === dennisArtistId)
```

2. Resultado del service:

```js
const payload = await fetchAdminArtists()
payload.artists.some((artist) => artist.id === dennisArtistId)
```

3. Estado AppContext:

```js
adminState.artists.some((artist) => artist.id === dennisArtistId)
```

4. UI:

```js
isPlatformOwner
accessibleArtists.some((artist) => artist.id === dennisArtistId)
filteredArtists.some((artist) => artist.id === dennisArtistId)
```

## Veredicto

El codigo local muestra dos puntos posibles de perdida:

1. RPC, si `v_is_platform_owner` no es true en Supabase runtime.
2. UI, si Dennis ya esta en `adminState.artists` pero `AdminArtists.jsx` calcula `isPlatformOwner = false`.

No hay filtro en service layer, mapper ni `loadAdminArtists()` que elimine a Dennis por ser independiente.

La linea exacta mas probable si el payload si llega al frontend es:

```js
src/pages/admin/AdminArtists.jsx:64
```

porque la UI cambia de lista global a lista por studio cuando `isPlatformOwner` es false.

La causa raiz a verificar primero es la consistencia entre:

- `session.role`, usado por `AppContext.loadAdminArtists()`.
- `session.user.role`, usado por `AdminArtists.jsx` para calcular `isPlatformOwner`.

Si esos dos valores divergen, AppContext puede cargar datos como admin real, pero la UI puede filtrar como usuario scoped y eliminar artistas independientes.
