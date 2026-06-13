# FASE 17.4B - APPOINTMENTS SOURCE VALIDATION

## Objetivo

Determinar exactamente que fuente alimenta actualmente:

- `ArtistDashboard`
- `ArtistAppointments`

despues de Fase 17.4, especialmente cuando siguen apareciendo:

- Maria Fernanda
- Camila Torres
- Ana Sofia
- Descanso
- Suite Rose
- Suite Nude

Este documento no implementa codigo y no modifica archivos productivos. Solo valida fuente de datos.

## Veredicto ejecutivo

Los nombres observados siguen apareciendo desde fuentes legacy/mock, no desde `appointments` reales.

Hay dos condiciones exactas:

```js
const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
```

Si esa condicion es `false`, la UI cae a fallback.

Pero hay un detalle importante:

- `ArtistAppointments` cae a `artistState.appointments`.
- `ArtistDashboard` agenda cae a `artistState.appointments`.
- `ArtistDashboard` vista `citas` cae a `mockArtistAppointments` importado directamente desde `mockData`.
- `Descanso 14:00 - 15:00` tambien aparece como texto fijo en `ArtistDashboard`, independiente de la fuente de citas.

Por eso Maria Fernanda, Camila Torres, Ana Sofia, Suite Rose y Suite Nude pueden seguir apareciendo aunque la nueva RPC exista.

## 1. Flujo actual: `ArtistDashboard`

Archivo:

`src/pages/artist/ArtistDashboard.jsx`

### Import legacy directo

Linea `13`:

```js
import { artistAppointments as mockArtistAppointments, recurringClients } from '../../services/mockData'
```

Esto mantiene una fuente mock directa dentro de `ArtistDashboard`.

### Context consumido

Lineas `77-89`:

```js
artistState
artistAppointments: realArtistAppointments
appointmentState
session
```

`realArtistAppointments` viene de:

```text
AppContext -> appointmentState.artistAppointments
```

### Fuente de agenda principal

Lineas `166-170`:

```js
const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
const artistAppointmentSource = realArtistAppointmentSourceReady
  ? realArtistAppointments
  : artistState.appointments
const appointmentsForSelectedDate = artistAppointmentSource.filter(apt => apt.date === selectedDate && apt.type === 'appointment')
```

Resultado:

| Condicion | Fuente renderizada |
|---|---|
| `!session.isMockSession && appointmentState.artistLoaded` | `appointmentState.artistAppointments` |
| cualquier otro caso | `artistState.appointments` |

### Render de agenda/timeline

Lineas `520-532`:

```js
appointmentsForSelectedDate.map(...)
```

Si aparecen Maria Fernanda/Camila/Ana en la agenda del dia antes de que `appointmentState.artistLoaded` sea true, vienen de:

```text
artistState.appointments
```

### Fuente de vista `citas`

Lineas `597-602`:

```js
{(realArtistAppointmentSourceReady ? realArtistAppointments : mockArtistAppointments).map((item) => (
```

Resultado:

| Condicion | Fuente renderizada en vista `citas` |
|---|---|
| `!session.isMockSession && appointmentState.artistLoaded` | `appointmentState.artistAppointments` |
| cualquier otro caso | `mockArtistAppointments` |

Esta rama no usa `artistState.appointments`; usa el import directo desde `mockData`.

### Texto fijo de descanso

Linea `500`:

```js
<span>Descanso 14:00 - 15:00</span>
```

Este `Descanso` no depende de `appointmentState`, `artistState.appointments` ni RPC. Es copy fijo de la tarjeta de reglas de agenda.

## 2. Flujo actual: `ArtistAppointments`

Archivo:

`src/pages/artist/ArtistAppointments.jsx`

### Context consumido

Lineas `18-26`:

```js
artistState
artistAppointments: realArtistAppointments
appointmentState
session
```

### Fuente principal/fallback

Lineas `41-46`:

```js
const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
const artistAppointmentSource = realArtistAppointmentSourceReady
  ? realArtistAppointments
  : artistState.appointments
const upcomingAppointments = artistAppointmentSource.filter((appointment) => appointment.status !== 'Completada')
const pastAppointments = artistAppointmentSource.filter((appointment) => appointment.status === 'Completada')
```

Resultado:

| Condicion | Fuente renderizada |
|---|---|
| `!session.isMockSession && appointmentState.artistLoaded` | `appointmentState.artistAppointments` |
| cualquier otro caso | `artistState.appointments` |

## 3. AppContext: carga real de appointments

Archivo:

`src/contexts/AppContext.jsx`

### Estado inicial

Lineas `662-667`:

```js
const [appointmentState, setAppointmentState] = useState({
  clientAppointments: [],
  artistAppointments: [],
  clientLoaded: false,
  artistLoaded: false,
})
```

Cantidad inicial real:

```text
appointmentState.artistAppointments.length = 0
appointmentState.artistLoaded = false
```

Mientras `artistLoaded = false`, la UI activa fallback.

### Reset por cambio de sesion

Lineas `678-693`:

```js
setAppointmentState({
  clientAppointments: [],
  artistAppointments: [],
  clientLoaded: false,
  artistLoaded: false,
})
```

Esto significa que en cada cambio de sesion/rol/artista hay una ventana donde la UI vuelve a fallback hasta que carga la RPC.

### Loader real artista

Lineas `1044-1069`:

```js
const loadArtistAppointments = useCallback(async (artistId = session.artist?.id || session.user?.artistId) => {
  if (!artistId || session.isMockSession || session.role !== ROLES.ARTIST) return []
  ...
  const appointments = await fetchArtistAppointments({ artistId })
  setAppointmentState((currentState) => ({
    ...currentState,
    artistAppointments: appointments,
    artistLoaded: true,
  }))
```

El loader solo corre si:

```text
artistId existe
session.isMockSession === false
session.role === ROLES.ARTIST
```

Si cualquiera de esas condiciones falla, no se llama RPC y `artistLoaded` se queda `false`.

### Efecto que dispara loader

Lineas `1071-1083`:

```js
if (session.role !== ROLES.ARTIST || session.isMockSession) return

const artistId = session.artist?.id || session.user?.artistId
if (!artistId) return

loadArtistAppointments(artistId)
```

## 4. Service y RPC

### Service

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

Cantidad devuelta por service:

```text
fetchArtistAppointments(...) devuelve data.appointments.length
```

No hay log actual en codigo, asi que el conteo exacto runtime no se puede observar desde UI sin DevTools o consulta directa.

### RPC

Archivo:

`supabase/migrations/202606110010_appointments_read_reconnection.sql`

La RPC filtra:

Linea `196`:

```sql
where appt.artist_id = v_artist_id;
```

Y antes resuelve scope por:

```sql
select *
from artists
where profile_id = v_profile.id
  and status <> 'archived'
limit 1;
```

Por tanto, si la sesion de artista no tiene un registro en `artists.profile_id = auth.uid()`, la RPC devuelve:

```json
{ "appointments": [] }
```

## 5. Conteos de registros

### Conteo RPC real

Desde codigo local, el conteo real es:

```text
appointmentState.artistAppointments.length
```

Estados posibles:

| Estado | Significado |
|---|---|
| `artistLoaded = false`, `artistAppointments.length = 0` | RPC no ha corrido o no puede correr. La UI usa fallback. |
| `artistLoaded = true`, `artistAppointments.length = 0` | RPC corrio y devolvio 0, o fallo y AppContext limpio a `[]`. La UI no deberia usar fallback. |
| `artistLoaded = true`, `artistAppointments.length > 0` | RPC corrio y la UI debe renderizar citas reales. |

No se puede afirmar el numero runtime exacto devuelto por Supabase desde el repositorio local sin consultar la instancia desplegada.

### Conteo fallback

Fuente:

`src/services/mockData.js`

`artistAppointments` contiene 4 registros:

| Registro | Tipo | Visible como |
|---|---|---|
| Maria Fernanda | `appointment` | Cita |
| Camila Torres | `appointment` | Cita |
| Descanso | `break` | Bloque/descanso |
| Ana Sofia | `appointment` | Cita |

`ArtistDashboard` agenda filtra:

```js
apt.date === selectedDate && apt.type === 'appointment'
```

Por tanto, en agenda/timeline fallback:

```text
fallback visible = 3 appointments
```

En `ArtistDashboard` vista `citas`, se hace map directo de `mockArtistAppointments`:

```text
fallback visible = 4 registros
```

En `ArtistAppointments`, se filtra por status:

```text
upcoming fallback = artistState.appointments.filter(status !== 'Completada')
```

Con los datos mock actuales, tambien incluye `Descanso` porque su status es `Descanso`, no `Completada`.

## 6. Condicion exacta que activa fallback

La condicion exacta es:

```js
!session.isMockSession && appointmentState.artistLoaded
```

Si es `false`, se usa fallback.

Se vuelve `false` cuando:

1. `session.isMockSession === true`.
2. `appointmentState.artistLoaded === false`.
3. El efecto no corrio porque `session.role !== ROLES.ARTIST`.
4. El efecto no corrio porque no existe `artistId`:

```js
session.artist?.id || session.user?.artistId
```

5. Acaba de cambiar la sesion y el reset puso `artistLoaded = false`.

Importante:

Si la RPC falla o devuelve 0 pero el loader entra al `catch`, AppContext pone:

```js
artistAppointments: []
artistLoaded: true
```

En ese caso la UI deberia mostrar lista real vacia, no fallback.

Por tanto, si los mocks siguen apareciendo de forma persistente, el problema mas probable no es "RPC devolvio 0", sino:

```text
appointmentState.artistLoaded sigue false
```

o la sesion sigue siendo mock/no artist.

## 7. Por que siguen apareciendo Maria Fernanda, Camila Torres y Ana Sofia

### Maria Fernanda

Fuente:

`src/services/mockData.js:17`

Tambien existe como client mock en:

`src/contexts/AppContext.jsx:386`

### Camila Torres

Fuente:

`src/services/mockData.js:38`

Tambien existe en clients mock:

`src/services/mockData.js:143`

### Ana Sofia

Fuente:

`src/services/mockData.js:80`

Tambien existe en clients mock:

`src/services/mockData.js:123`

### Suite Rose / Suite Nude

Fuente:

- `src/services/mockData.js:21`
- `src/services/mockData.js:42`

### Descanso

Tiene dos fuentes:

1. Registro mock:

`src/services/mockData.js:58-63`

2. Texto fijo de UI:

`src/pages/artist/ArtistDashboard.jsx:500`

```js
<span>Descanso 14:00 - 15:00</span>
```

## 8. Respuesta directa

### ¿La UI esta renderizando A, B o C?

| Pantalla/seccion | Fuente si real ready | Fuente si fallback |
|---|---|---|
| `ArtistDashboard` agenda/timeline | A: `appointmentState.artistAppointments` | B: `artistState.appointments` |
| `ArtistDashboard` vista `citas` | A: `appointmentState.artistAppointments` | C: `mockArtistAppointments` import directo |
| `ArtistAppointments` | A: `appointmentState.artistAppointments` | B: `artistState.appointments` |
| `ArtistDashboard` reglas de agenda | N/A | C: texto fijo `Descanso 14:00 - 15:00` |

### Si `appointmentState.artistAppointments` esta vacio, por que?

Puede ser por dos casos distintos:

| Estado | Causa probable | UI |
|---|---|---|
| `artistLoaded = false`, `artistAppointments = []` | Loader no corrio aun, sesion mock, rol no artist o falta `artistId`. | Muestra fallback mock/local. |
| `artistLoaded = true`, `artistAppointments = []` | RPC devolvio 0 o fallo y se limpio estado. | Debe mostrar lista vacia real, no fallback. |

### Cantidad de registros RPC vs fallback

| Fuente | Conteo local determinable |
|---|---:|
| RPC real | No determinable desde repo sin consultar Supabase runtime; en UI corresponde a `appointmentState.artistAppointments.length`. |
| Fallback `artistState.appointments` inicial | 4 registros mock desde `artistAppointments`. |
| Fallback `ArtistDashboard` agenda filtrada | 3 appointments porque excluye `type = break`. |
| Fallback `ArtistDashboard` vista `citas` | 4 registros porque mapea `mockArtistAppointments` directo. |
| Fallback `ArtistAppointments` upcoming | 4 registros si ninguno tiene status `Completada`. |

## Veredicto

Maria Fernanda, Camila Torres, Ana Sofia, Suite Rose y Suite Nude siguen apareciendo porque alguna rama de fallback sigue activa.

La condicion exacta es:

```js
realArtistAppointmentSourceReady === false
```

equivalente a:

```js
session.isMockSession === true || appointmentState.artistLoaded === false
```

Ademas, `ArtistDashboard` todavia tiene un fallback directo a `mockArtistAppointments` en la vista `citas`, y un texto fijo `Descanso 14:00 - 15:00`.

La validacion siguiente debe confirmar en runtime estos valores:

```js
session.isMockSession
session.role
session.artist?.id
session.user?.artistId
appointmentState.artistLoaded
appointmentState.artistAppointments.length
artistAppointmentsError
```

Si `artistLoaded` es `false`, la RPC no esta alimentando la UI. Si `artistLoaded` es `true` y aun aparecen esos nombres, entonces la seccion visible probablemente es la vista `citas` con fallback directo o un bloque hardcodeado.
