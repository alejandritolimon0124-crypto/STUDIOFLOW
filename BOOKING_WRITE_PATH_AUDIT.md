# FASE 17.5 - BOOKING WRITE PATH AUDIT

## Objetivo

Auditar el flujo completo de escritura de booking:

```text
Marketplace
  -> seleccion de horario
  -> confirmacion
  -> bookSlot()
  -> persistencia
```

Este documento no implementa codigo, no crea SQL/RPC y no modifica flujos. Solo identifica la fuente actual de escritura y por que `appointments` permanece vacio.

## Veredicto ejecutivo

El booking actual no escribe en Supabase.

El flujo de Marketplace en `ClientDashboard` termina en:

```text
bookSlot()
  -> setAgendaSettings()
  -> agendaSettings.bookedSlots
```

No existe insert a `appointments`, no existe RPC de booking y no se actualiza `availability_slots`.

Ademas:

- `agendaSettings.bookedSlots` vive solo en estado React runtime.
- `agendaSettings` no se persiste en localStorage.
- Al recargar la pagina, las reservas creadas por Marketplace cliente se pierden.
- `appointments` permanece vacio porque ningun flujo de escritura llama Supabase.

## 1. Flujo actual desde Marketplace

### Entrada de Marketplace

Archivo:

`src/pages/client/ClientDashboard.jsx`

| Linea | Pieza | Funcion |
|---:|---|---|
| `423` | `bookSlot` | Se consume desde `AppContext`. |
| `428` | `bookingDate` | Fecha local inicial `2026-05-18`. |
| `452-459` | `availableSlots` | Llama `getAvailableSlots(...)`. |
| `650-657` | `bookedAppointments` | Lee `agendaSettings.bookedSlots` solo si no esta lista la fuente real. |
| `662-675` | `reserveSlot(slot)` | Confirma la reserva y llama `bookSlot(...)`. |
| `1126-1140` | Boton `Reservar` | Ejecuta `reserveSlot(slot)` en perfil publico. |
| `1399-1412` | Boton `Reservar` | Ejecuta `reserveSlot(slot)` en perfil favorito/publico. |

### Seleccion de horario

La disponibilidad se calcula en frontend:

```js
const availableSlots = useMemo(
  () => getAvailableSlots({
    artistId: selectedArtistProfile?.id,
    studioId: selectedArtistStudio?.id || null,
    membershipId: selectedArtistMembership?.id || null,
    date: bookingDate,
    durationMinutes: marketplaceService.durationMinutes || 60,
  }),
  [...]
)
```

Fuente:

```text
ClientDashboard -> getAvailableSlots -> AppContext -> agendaSettings
```

No consulta:

- `availability_slots`
- `schedules`
- `schedule_rules`
- `calendar_blocks`
- Supabase RPC

### Confirmacion

`reserveSlot(slot)` valida solo:

| Validacion | Resultado |
|---|---|
| `!slot.available` | retorna sin reservar |
| `!selectedArtistProfile?.id` | retorna sin reservar |

Luego llama:

```js
bookSlot({
  ...slot,
  artistId: selectedArtistProfile.id,
  studioId: selectedArtistStudio?.id || null,
  membershipId: selectedArtistMembership?.id || null,
  artist: selectedArtistProfile?.owner || selectedArtistProfile?.name || 'Valeria Moon',
  service: marketplaceService.name,
  durationMinutes: marketplaceService.durationMinutes,
})
```

No hay modal transaccional ni llamada backend en este punto.

## 2. `bookSlot()` actual

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Pieza | Funcion |
|---:|---|---|
| `1517` | `bookSlot` | Funcion central de escritura local. |
| `1518-1521` | Validacion artista | Si falta `artistId`, muestra `window.alert`. |
| `1523-1528` | `slotWithClient` | Construye payload local. |
| `1530-1533` | Duplicado cliente/servicio | Compara contra `agendaSettings.bookedSlots`. |
| `1540-1555` | `setAgendaSettings` | Agrega slot a `bookedSlots`. |

Persistencia real actual:

```js
setAgendaSettings((currentSettings) => ({
  ...currentSettings,
  bookedSlots: [...currentSettings.bookedSlots, slotWithClient],
}))
```

No existe en `bookSlot()`:

- `supabase.from('appointments').insert(...)`
- `client.rpc('...booking...')`
- `appointment_status_events`
- update de `availability_slots.status`
- `audit_events`
- `appointment_economies`

## 3. Donde se guarda actualmente

### Cliente / Marketplace

| Capa | Guarda en | Persistencia |
|---|---|---|
| `reserveSlot()` | No guarda; llama `bookSlot()` | N/A |
| `bookSlot()` | `agendaSettings.bookedSlots` | React state runtime |
| `ClientDashboard` proximas citas | Lee `agendaSettings.bookedSlots` si no hay fuente real cargada | Runtime |

Conclusion:

```text
Marketplace cliente guarda en memoria runtime, no en Supabase y no en localStorage.
```

### Artista / Nueva cita

Los flujos de artista escriben en dos fuentes locales:

| Archivo | Linea | Escritura |
|---|---:|---|
| `src/pages/artist/ArtistDashboard.jsx` | `269-275` | `addArtistAppointment(...)` |
| `src/pages/artist/ArtistDashboard.jsx` | `277-287` | `bookSlot(...)` |
| `src/pages/artist/ArtistAppointments.jsx` | `73-83` | `addArtistAppointment(...)` |
| `src/pages/artist/ArtistAppointments.jsx` | `84-94` | `bookSlot(...)` |

`addArtistAppointment()` vive en:

`src/contexts/AppContext.jsx:1860-1878`

y escribe en:

```text
artistState.appointments
```

Esa fuente si se persiste en localStorage por el efecto:

`src/contexts/AppContext.jsx:988-994`

```js
localStorage.setItem(artistStateStorageKey, JSON.stringify(artistState))
```

## 4. localStorage usado

### Keys definidos

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Key | Uso |
|---:|---|---|
| `66` | `studio-flow-session` | Sesion local/demo/Supabase wrapper. |
| `67` | `studio-flow-admin-state-mock` | Estado admin demo. |
| `68` | `studio-flow-admin-state-real` | Prefijo estado admin real por profile. |
| `69` | `studio-flow-client-state` | Estado cliente local. |
| `70` | `studio-flow-artist-state` | Estado artista local. |

### Persistencia relacionada

| Estado | Key | Linea | Incluye booking |
|---|---|---:|---|
| `clientState` | `studio-flow-client-state` | `982` | No guarda `bookedSlots`. |
| `artistState` | `studio-flow-artist-state` | `990` | Si guarda `artistState.appointments`. |
| `adminState` | key admin mock/real | `974` | No es write path de booking cliente. |
| `agendaSettings` | Ninguno | N/A | `bookedSlots` no se persiste. |

Conclusion:

```text
bookedSlots no tiene localStorage propio.
artistState.appointments si queda persistido en studio-flow-artist-state.
```

## 5. Estado actualizado

### Booking cliente

Actualiza:

```text
agendaSettings.bookedSlots
```

No actualiza:

- `appointmentState.clientAppointments`
- `appointmentState.artistAppointments`
- `artistState.appointments`
- `adminState.dashboard.appointments`
- `appointments` en Supabase

### Booking artista

Actualiza:

```text
artistState.appointments
agendaSettings.bookedSlots
```

No actualiza:

- `appointments` en Supabase
- `appointment_status_events`
- `appointmentState.artistAppointments`

## 6. Escritura a Supabase

No se encontro escritura a Supabase para booking.

Busqueda relevante:

| Patron | Resultado |
|---|---|
| `supabase.from('appointments').insert` | No existe. |
| `client.rpc('studio_flow_*booking*')` | No existe. |
| `studio_flow_client_book_appointment` | No existe. |
| `bookSlot()` usando service | No existe. |
| `appointmentService.js` | Solo lectura RPC. |

`src/services/appointmentService.js` solo tiene:

| Funcion | Tipo |
|---|---|
| `fetchClientAppointments()` | Lectura |
| `fetchArtistAppointments({ artistId })` | Lectura |

No contiene create/update/cancel appointment.

## 7. Por que `appointments = 0`

`appointments` permanece vacio porque el flujo que parece reservar una cita nunca llega a esa tabla.

Ruta actual:

```text
ClientDashboard
  -> availableSlots local
  -> reserveSlot(slot)
  -> bookSlot(slot)
  -> setAgendaSettings()
  -> agendaSettings.bookedSlots
```

Ruta inexistente:

```text
ClientDashboard
  -> booking service
  -> RPC transaccional
  -> insert appointments
  -> insert appointment_status_events
  -> update availability_slots
```

La tabla `appointments` solo se lee en fases recientes:

- Admin Dashboard.
- Admin Clients.
- Client appointments read reconnection.
- Artist appointments read reconnection.

Pero no hay ningun writer real.

## 8. Mapa final del write path

| Paso | Archivo | Fuente/accion actual | Supabase |
|---|---|---|---|
| Marketplace lista artistas | `ClientDashboard.jsx` | `adminState.artists` + mappers legacy | No directo |
| Seleccion fecha | `ClientDashboard.jsx:428` | `bookingDate` local | No |
| Disponibilidad | `ClientDashboard.jsx:452-459` | `getAvailableSlots()` | No |
| Slot reservado | `ClientDashboard.jsx:1126-1140`, `1399-1412` | Boton llama `reserveSlot(slot)` | No |
| Confirmacion | `ClientDashboard.jsx:662-675` | `bookSlot({...slot})` | No |
| Persistencia booking cliente | `AppContext.jsx:1540-1555` | `agendaSettings.bookedSlots` | No |
| Proximas citas cliente fallback | `ClientDashboard.jsx:650-660` | `agendaSettings.bookedSlots` + mock | No |
| Nueva cita artista | `ArtistDashboard.jsx:269-287`, `ArtistAppointments.jsx:73-94` | `addArtistAppointment()` + `bookSlot()` | No |
| Persistencia cita artista | `AppContext.jsx:1860-1878` | `artistState.appointments` | No |
| localStorage artista | `AppContext.jsx:990` | `studio-flow-artist-state` | No |

## 9. Riesgo operativo

| Riesgo | Impacto |
|---|---|
| Reserva cliente no persiste | La cita desaparece al recargar. |
| Owner no ve nuevas citas | AdminDashboard lee `appointments`, pero booking no escribe ahi. |
| Artista ve citas locales | `artistState.appointments` puede mostrar citas inexistentes en Supabase. |
| Cliente ve fallback mixto | Si la fuente real no esta lista, mezcla `bookedSlots` y mock. |
| Doble booking real no protegido | No se usa constraint `appointments_availability_slot_unique`. |
| No hay status events | No existe historial real de cambios. |
| No hay economy/commission | La cita local no genera datos financieros reales. |

## Veredicto

La razon exacta de `appointments = 0` es:

```text
bookSlot() no escribe appointments.
```

Actualmente `bookSlot()` solo marca un slot como reservado dentro de:

```text
agendaSettings.bookedSlots
```

Ese estado no tiene persistencia localStorage propia y no tiene persistencia Supabase.

El camino correcto para la siguiente fase no es investigar mas la lectura, sino implementar el write path real:

```text
bookSlot()
  -> RPC/service transaccional
  -> appointments
  -> appointment_status_events
  -> availability_slots.status = booked
```

