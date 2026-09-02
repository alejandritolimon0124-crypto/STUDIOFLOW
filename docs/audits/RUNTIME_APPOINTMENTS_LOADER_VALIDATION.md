# FASE 17.4C - RUNTIME APPOINTMENTS LOADER VALIDATION

## Objetivo

Determinar por que `realArtistAppointmentSourceReady` permanece `false` para Dennis Beauty Studio.

Este documento no implementa codigo, no modifica logica y no crea SQL/RPC. Solo audita la cadena:

```text
session
  -> loadArtistAppointments
  -> RPC
  -> appointmentState
  -> ArtistDashboard
```

## Limite de evidencia runtime

Desde el repositorio local se puede validar la cadena de codigo y las condiciones exactas, pero no se pueden conocer valores runtime exactos de la sesion real de Dennis sin:

- inspeccionar el navegador donde esta logueada la sesion real, o
- ejecutar RPC con el JWT de esa sesion autenticada.

El workspace tiene `.env.local`, pero URL/anon key no bastan para saber:

- `session.isMockSession`
- `session.role`
- `session.artist?.id`
- `appointmentState.artistLoaded`
- `appointmentState.artistAppointments.length`

Esos valores viven en runtime React/browser.

## Veredicto ejecutivo

La primera condicion probable que rompe la cadena es:

```js
session.role !== ROLES.ARTIST
```

Motivo:

Dennis Beauty Studio ha sido tratado en auditorias previas como `platform_owner`/admin viendo Admin Artists, no necesariamente como una sesion `artist`.

El loader de citas de artista solo corre si:

```js
session.role === ROLES.ARTIST
```

Si la sesion actual de Dennis Beauty Studio es `platform_owner`, `studio_owner`, `studio_manager` o cualquier rol distinto de `artist`, entonces:

```text
loadArtistAppointments() no se ejecuta
fetchArtistAppointments() no se llama
studio_flow_get_artist_appointments() no se llama
appointmentState.artistLoaded queda false
ArtistDashboard cae a fallback
```

## 1. Validacion de session runtime

### Valores requeridos

Para que la cadena funcione:

| Campo | Valor requerido |
|---|---|
| `session.isMockSession` | `false` |
| `session.role` | `artist` |
| `session.artist?.id` o `session.user?.artistId` | uuid real de `artists.id` |

### Codigo que construye estos valores

Archivo:

`src/contexts/AppContext.jsx`

Lineas `116-158`:

```js
function createSessionFromAuthContext(authSession, authContext = {}) {
  ...
  const role = getActiveRole(authContext)
  const artistId = authContext.artist?.id || null
  ...
  return {
    user: {
      ...
      role,
      artistId,
    },
    role,
    artist: authContext.artist || null,
    ...
    isMockSession: false,
  }
}
```

El `artistId` solo existe si `studio_flow_get_auth_context()` devuelve `authContext.artist`.

### Fuente DB de `authContext.artist`

Archivo:

`supabase/migrations/202606100012_auth_foundation.sql`

Lineas `149-153`:

```sql
select *
into v_artist
from artists
where profile_id = v_profile.id
order by created_at
limit 1;
```

Por tanto:

```text
session.artist existe solo si artists.profile_id = auth.uid()
```

Si Dennis existe como artist record pero el usuario autenticado no es el `profile_id` de ese artist, entonces:

```text
session.artist = null
session.user.artistId = null
```

## 2. Validar si `loadArtistAppointments()` se ejecuta

Archivo:

`src/contexts/AppContext.jsx`

Lineas `1071-1083`:

```js
useEffect(() => {
  if (session.role !== ROLES.ARTIST || session.isMockSession) return

  const artistId = session.artist?.id || session.user?.artistId
  if (!artistId) return

  loadArtistServices(artistId).catch(...)
  loadArtistAppointments(artistId).catch(...)
}, [...])
```

### Condiciones de salida anticipada

| Condicion | Resultado |
|---|---|
| `session.role !== ROLES.ARTIST` | No ejecuta loader. |
| `session.isMockSession === true` | No ejecuta loader. |
| `!session.artist?.id && !session.user?.artistId` | No ejecuta loader. |

Si cualquiera se cumple, el loader no corre.

## 3. Validar si `fetchArtistAppointments()` es llamado

Archivo:

`src/contexts/AppContext.jsx`

Lineas `1044-1051`:

```js
const loadArtistAppointments = useCallback(async (artistId = session.artist?.id || session.user?.artistId) => {
  if (!artistId || session.isMockSession || session.role !== ROLES.ARTIST) return []
  ...
  const appointments = await fetchArtistAppointments({ artistId })
```

Archivo:

`src/services/appointmentService.js`

Lineas `62-70`:

```js
export async function fetchArtistAppointments({ artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_get_artist_appointments', {
    p_artist_id: artistId || null,
  })
  ...
  return mapAppointmentsPayload(data)
}
```

`fetchArtistAppointments()` solo puede ser llamado si `loadArtistAppointments()` supera la guarda:

```js
!artistId || session.isMockSession || session.role !== ROLES.ARTIST
```

## 4. Validar resultado real de RPC

RPC:

`studio_flow_get_artist_appointments(p_artist_id)`

Archivo:

`supabase/migrations/202606110010_appointments_read_reconnection.sql`

### Scope interno

Lineas `121-130`:

```sql
select *
into v_artist
from artists
where profile_id = v_profile.id
  and status <> 'archived'
limit 1;
```

Si no encuentra artista propio:

Lineas `132-134`:

```sql
if v_artist.id is null then
  return jsonb_build_object('appointments', '[]'::jsonb);
end if;
```

Luego valida:

Lineas `136-139`:

```sql
v_artist_id := coalesce(p_artist_id, v_artist.id);

if v_artist_id <> v_artist.id then
  raise exception 'Artist scope does not allow reading these appointments';
end if;
```

Y filtra:

Linea `196`:

```sql
where appt.artist_id = v_artist_id;
```

### Resultado esperado segun DB

| Caso | Resultado RPC |
|---|---|
| `artists.profile_id = auth.uid()` y hay citas para ese `artist_id` | `appointments.length > 0` |
| `artists.profile_id = auth.uid()` pero no hay citas | `appointments.length = 0` |
| no existe artist propio para `auth.uid()` | `appointments.length = 0` |
| `p_artist_id` no coincide con artist propio | error scope |

## 5. Valores exactos solicitados

### Valores observables desde codigo local

No hay valores runtime exactos disponibles desde el repo. Los valores actuales solo pueden capturarse en navegador o con token de sesion.

### Valores que deben capturarse en runtime

| Campo | Fuente runtime | Interpretacion |
|---|---|---|
| `session.isMockSession` | `useApp().session.isMockSession` | Debe ser `false`. |
| `session.role` | `useApp().session.role` | Debe ser `artist`. |
| `session.artist?.id` | `useApp().session.artist?.id` | Debe existir. |
| `session.user?.artistId` | `useApp().session.user?.artistId` | Fallback artist id. |
| `appointmentState.artistLoaded` | `useApp().appointmentState.artistLoaded` | Debe pasar a `true` despues del loader. |
| `appointmentState.artistAppointments.length` | `useApp().appointmentState.artistAppointments.length` | Conteo real normalizado. |
| `artistAppointmentsError` | `useApp().artistAppointmentsError` | Error si RPC fallo. |

## 6. Primera condicion que rompe la cadena

### Cadena esperada

```text
session.isMockSession === false
  -> session.role === 'artist'
  -> session.artist?.id || session.user?.artistId existe
  -> loadArtistAppointments(artistId)
  -> fetchArtistAppointments({ artistId })
  -> studio_flow_get_artist_appointments(p_artist_id)
  -> appointmentState.artistLoaded = true
  -> ArtistDashboard usa appointmentState.artistAppointments
```

### Primer punto de corte mas probable

El primer punto de corte mas probable es:

```js
if (session.role !== ROLES.ARTIST || session.isMockSession) return
```

en `src/contexts/AppContext.jsx:1072`.

Si Dennis Beauty Studio esta en una sesion `platform_owner` o `studio_owner`, esta condicion corta antes de:

- `loadArtistAppointments()`
- `fetchArtistAppointments()`
- RPC
- `appointmentState.artistLoaded = true`

### Segundo punto de corte posible

Si el rol si es `artist`, el siguiente punto de corte es:

```js
const artistId = session.artist?.id || session.user?.artistId
if (!artistId) return
```

en `src/contexts/AppContext.jsx:1074-1075`.

Esto ocurre si `studio_flow_get_auth_context()` no encontro:

```sql
artists.profile_id = auth.uid()
```

## 7. Por que `realArtistAppointmentSourceReady` queda false

En UI:

`src/pages/artist/ArtistDashboard.jsx:166`

```js
const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
```

Se mantiene `false` si:

| Causa | Efecto |
|---|---|
| `session.isMockSession = true` | `!session.isMockSession` es false. |
| `appointmentState.artistLoaded = false` | Fuente real no esta lista. |
| loader no corre por rol distinto a artist | `artistLoaded` permanece false. |
| loader no corre por falta de artist id | `artistLoaded` permanece false. |

La causa mas consistente con el caso Dennis Beauty Studio es:

```text
Dennis esta siendo usado como entidad artist/studio en Admin/Platform, pero la sesion activa no es una sesion artist con artists.profile_id = auth.uid().
```

## 8. Conteos

### RPC

No se puede reportar conteo exacto sin ejecutar con JWT real.

El conteo runtime equivale a:

```js
appointmentState.artistAppointments.length
```

### Fallback

El fallback local inicial sigue teniendo 4 registros en `src/services/mockData.js`:

| Registro | Fuente |
|---|---|
| Maria Fernanda | `artistAppointments` mock |
| Camila Torres | `artistAppointments` mock |
| Descanso | `artistAppointments` mock y copy fijo |
| Ana Sofia | `artistAppointments` mock |

## 9. Diagnostico final

La primera condicion que probablemente rompe la cadena es:

```js
session.role !== ROLES.ARTIST
```

Si Dennis Beauty Studio se esta viendo desde Platform Owner/Admin, el loader de artista nunca corre. Eso explica:

```text
appointmentState.artistLoaded = false
realArtistAppointmentSourceReady = false
ArtistDashboard / ArtistAppointments usan fallback
```

Si la sesion si es `artist`, entonces el siguiente sospechoso es:

```js
session.artist?.id || session.user?.artistId
```

vacio porque `studio_flow_get_auth_context()` no encontro un `artists.profile_id` vinculado al usuario autenticado.

## 10. Evidencia necesaria para cerrar runtime

Para cerrar con valores exactos, capturar en navegador:

```js
const {
  session,
  appointmentState,
  artistAppointments,
  artistAppointmentsError,
} = useApp()
```

Y reportar:

```js
{
  isMockSession: session.isMockSession,
  role: session.role,
  artistIdFromSessionArtist: session.artist?.id,
  artistIdFromUser: session.user?.artistId,
  artistLoaded: appointmentState.artistLoaded,
  realCount: appointmentState.artistAppointments.length,
  exportedCount: artistAppointments.length,
  error: artistAppointmentsError,
}
```

Sin esos valores runtime, el repositorio permite afirmar la condicion de corte, pero no el valor exacto de la sesion de Dennis.

## Veredicto

La cadena se rompe antes de RPC si la sesion actual no es:

```text
role = artist
isMockSession = false
artistId presente
```

Para Dennis Beauty Studio, el primer corte mas probable es rol no artist. En ese caso `loadArtistAppointments()` no se ejecuta, `fetchArtistAppointments()` no se llama, la RPC no corre, `appointmentState.artistLoaded` permanece `false` y la UI cae al fallback legacy/mock.
