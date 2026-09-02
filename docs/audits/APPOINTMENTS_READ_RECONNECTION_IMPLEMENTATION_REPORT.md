# FASE 17.4 - APPOINTMENTS READ RECONNECTION IMPLEMENTATION

## Objetivo

Implementar la primera migracion real de citas:

```text
LECTURA DE CITAS REALES
```

Sin tocar todavia:

- `getAvailableSlots()`
- `bookSlot()`
- availability
- booking transaccional

## Implementado

| Pieza | Resultado |
|---|---|
| RPC lectura cliente | `studio_flow_get_client_appointments()` |
| RPC lectura artista | `studio_flow_get_artist_appointments(p_artist_id)` |
| Service layer | `src/services/appointmentService.js` |
| AppContext loaders | `loadClientAppointments()` y `loadArtistAppointments()` |
| Estado AppContext | `appointmentState.clientAppointments` y `appointmentState.artistAppointments` |
| ClientDashboard | Lee citas reales como fuente principal en sesion real. |
| ArtistDashboard | Lee citas reales como fuente principal en sesion real. |
| ArtistAppointments | Lee citas reales como fuente principal en sesion real. |
| Fallback temporal | `bookedSlots` y `artistState.appointments` se conservan para mock/fallback. |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `supabase/migrations/202606110010_appointments_read_reconnection.sql` | Nueva migracion de RPCs read-only para citas cliente/artista. |
| `src/services/appointmentService.js` | Nuevo service para consumir RPCs y normalizar appointments al shape actual de UI. |
| `src/contexts/AppContext.jsx` | Importa service, agrega estado/loaders de citas reales y expone datos al contexto. |
| `src/pages/client/ClientDashboard.jsx` | Usa `clientAppointments` reales cuando la sesion es real y el loader termino. |
| `src/pages/artist/ArtistDashboard.jsx` | Usa `artistAppointments` reales para agenda/timeline y lista de citas. |
| `src/pages/artist/ArtistAppointments.jsx` | Usa `artistAppointments` reales para proximas/pasadas. |

## RPCs agregadas

### `studio_flow_get_client_appointments()`

Scope:

- Requiere `auth.uid()`.
- Requiere `profiles.status = active`.
- Resuelve `clients.profile_id = auth.uid()`.
- Devuelve solo citas de ese `client_id`.

Payload:

- `id`
- `clientId`
- `artistId`
- `studioId`
- `membershipId`
- `serviceOfferingId`
- `availabilitySlotId`
- `client`
- `artist`
- `service`
- `serviceTier`
- `date`
- `time`
- `end`
- `startsAt`
- `endsAt`
- `duration`
- `room`
- `address`
- `status`
- `appointmentStatus`
- economy basica si existe

### `studio_flow_get_artist_appointments(p_artist_id)`

Scope:

- Requiere `auth.uid()`.
- Requiere `profiles.status = active`.
- Resuelve el artista propio por `artists.profile_id = auth.uid()`.
- Si `p_artist_id` difiere del artista propio, rechaza scope.
- Devuelve solo citas de ese `artist_id`.

## Service layer

Archivo:

`src/services/appointmentService.js`

Funciones:

| Funcion | Uso |
|---|---|
| `fetchClientAppointments()` | Carga citas reales para ClientDashboard. |
| `fetchArtistAppointments({ artistId })` | Carga citas reales para ArtistDashboard/ArtistAppointments. |

El mapper normaliza el payload al contrato visual existente:

- `date`
- `time`
- `service`
- `artist`
- `client`
- `status`
- `duration`
- `grossAmount`
- `platformFee`
- `artistRevenue`

## AppContext

Se agrego:

```js
appointmentState = {
  clientAppointments: [],
  artistAppointments: [],
  clientLoaded: false,
  artistLoaded: false,
}
```

Loaders:

- `loadClientAppointments()`
- `loadArtistAppointments()`

Flags/errores:

- `isClientAppointmentsLoading`
- `clientAppointmentsError`
- `isArtistAppointmentsLoading`
- `artistAppointmentsError`

Tambien se limpia `appointmentState` cuando cambia:

- `session.role`
- `session.profile.id`
- `session.client.id`
- `session.artist.id`
- `session.isMockSession`

Esto evita que una sesion vea citas cargadas por otro actor.

## ClientDashboard

Antes:

```text
upcomingAppointments
  -> agendaSettings.bookedSlots
  -> clientAppointments mock
```

Ahora:

```text
sesion real + appointmentState.clientLoaded
  -> clientAppointments reales

mock/fallback
  -> bookedSlots + mockClientAppointments
```

Tambien `clientHistoryConnected` usa la fuente real cuando esta disponible.

No se modifico:

- `getAvailableSlots()`
- `reserveSlot()`
- `bookSlot()`
- flujo visual de marketplace/booking

## ArtistDashboard

Antes:

```text
appointmentsForSelectedDate
  -> artistState.appointments
```

Ahora:

```text
sesion real + appointmentState.artistLoaded
  -> artistAppointments reales

mock/fallback
  -> artistState.appointments
```

La lista secundaria de `view === 'citas'` tambien prefiere citas reales y conserva mock como fallback.

No se modifico:

- `saveAppointment()`
- `addArtistAppointment()`
- `bookSlot()`

## ArtistAppointments

Antes:

```text
upcomingAppointments / pastAppointments
  -> artistState.appointments
```

Ahora:

```text
sesion real + appointmentState.artistLoaded
  -> artistAppointments reales

mock/fallback
  -> artistState.appointments
```

No se modifico:

- formulario de nueva cita
- `addArtistAppointment()`
- `bookSlot()`

## Decisiones tomadas

| Decision | Motivo |
|---|---|
| Usar RPC `SECURITY DEFINER` read-only | Evita depender de RLS directa y mantiene scope dentro de DB. |
| No mutar `artistState.appointments` con datos reales | Evita mezclar cache real con estado legacy/local. |
| Agregar `appointmentState` separado | Permite diferenciar fuente real vs fallback. |
| Mantener fallback local | Evita romper modo demo y flujos de booking aun no migrados. |
| No tocar booking transaccional | Respeta el alcance de Fase 17.4. |

## Riesgos encontrados

| Riesgo | Estado |
|---|---|
| Booking sigue escribiendo en `bookedSlots` | Pendiente para fase de booking real. |
| Artist create appointment sigue local | Pendiente para fase de booking real con source `artist`. |
| Disponibilidad sigue en `getAvailableSlots()` local | Pendiente para fase availability. |
| ClientDashboard aun importa mocks para fallback | Permitido temporalmente; no es fuente principal en sesion real cargada. |
| ArtistDashboard aun importa mocks para fallback/lista secundaria | Permitido temporalmente; no es fuente principal en sesion real cargada. |

## Validacion

Comando ejecutado:

```text
npm run build
```

Resultado:

- Build exitoso.
- Vite transformo 137 modulos.
- PWA genero assets.
- Persiste advertencia existente de chunk mayor a 500 kB.

## Resultado esperado

Con una sesion real:

```text
ClientDashboard
  -> loadClientAppointments()
  -> studio_flow_get_client_appointments()
  -> appointments reales
```

```text
ArtistDashboard / ArtistAppointments
  -> loadArtistAppointments()
  -> studio_flow_get_artist_appointments()
  -> appointments reales
```

Una cita existente en `appointments` debe verse en:

- ClientDashboard, si pertenece al `client_id` de la sesion.
- ArtistDashboard, si pertenece al `artist_id` de la sesion.
- ArtistAppointments, si pertenece al `artist_id` de la sesion.

## No implementado

- No se cambio `getAvailableSlots()`.
- No se cambio `bookSlot()`.
- No se implemento booking transaccional.
- No se migro `availability_slots`.
- No se eliminaron `bookedSlots`.
- No se eliminaron `artistState.appointments`.
- No se redisenaron pantallas.

## Veredicto

La primera reconexion quedo aplicada:

```text
appointments reales -> service -> AppContext -> ClientDashboard / ArtistDashboard / ArtistAppointments
```

`bookedSlots` y `artistState.appointments` siguen existiendo, pero ya no son la fuente principal para citas en sesiones reales una vez que los loaders de appointments terminan.
