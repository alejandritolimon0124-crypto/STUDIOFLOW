# FASE 17.9 - AVAILABILITY & APPOINTMENTS WRITE AUDIT

## Objetivo

Determinar exactamente que fuente alimenta:

1. disponibilidad de horarios cliente;
2. generar cita artista.

Este documento no implementa codigo, no modifica logica y no crea SQL/RPC. Solo auditoria.

## Veredicto ejecutivo

Dennis ya aparece en Marketplace y Mirna ya ve servicios reales porque Marketplace Read esta conectado.

Pero los horarios no estan conectados:

```text
ClientDashboard
  -> isRealMarketplace = true
  -> availableSlots = []
  -> "Sin horarios disponibles"
```

No hay RPC de availability, no hay service de availability y `availability_slots` no se consulta desde el flujo cliente.

En paralelo, "Generar nueva cita" / "Nueva cita" de artista sigue siendo local/mock:

```text
Artist UI
  -> addArtistAppointment()
  -> artistState.appointments
  -> localStorage studio-flow-artist-state

Artist UI
  -> bookSlot()
  -> agendaSettings.bookedSlots
  -> React state runtime
```

Por eso `appointments` sigue sin recibir escrituras desde esos formularios.

## 1. Cliente -> selecciona servicio -> carga horarios

### Frontend

Archivo:

`src/pages/client/ClientDashboard.jsx`

El componente consume:

```js
marketplaceListings
bookSlot
getAvailableSlots
```

El modo real se define con:

```js
const isRealMarketplace = !session.isMockSession
```

### Servicios reales

En sesiones reales, los servicios vienen de:

```text
marketplaceListings
  -> buildServiceGroupsFromListings()
  -> marketplaceService
```

Eso ya esta conectado a Marketplace Read.

### Horarios

La disponibilidad se calcula en:

```js
const availableSlots = useMemo(
  () => {
    if (isRealMarketplace) return []

    return getAvailableSlots(...)
  },
  [...]
)
```

Condicion exacta:

```text
isRealMarketplace === true
```

Resultado exacto:

```text
availableSlots.length = 0
```

No importa si Dennis tiene servicios reales; para Marketplace real el array de slots esta hardcodeado a vacio.

## 2. Tabla/RPC que produce horarios

Actualmente ninguna.

| Capa | Estado |
|---|---|
| Frontend | `availableSlots = []` si marketplace real. |
| AppContext | `getAvailableSlots()` existe, pero solo se usa para mock/local cuando `isRealMarketplace` es false. |
| Service Layer | No existe `availabilityService`. |
| RPC | No existe `studio_flow_marketplace_get_availability` ni equivalente. |
| Supabase | `availability_slots` existe, pero no se consulta en este flujo. |

## 3. Se consulta `availability_slots`?

No.

Busqueda de referencias:

- `availability_slots` aparece en migraciones/schema.
- No aparece como lectura desde `ClientDashboard`.
- No aparece como service real de cliente.
- No hay RPC marketplace de availability.

La unica RPC marketplace actual es:

```text
studio_flow_marketplace_get_listings()
```

Esa RPC lee listings/perfiles/artistas/servicios. No devuelve slots.

## 4. Cantidad de slots devueltos

### En UI cliente real

```text
availableSlots.length = 0
```

Motivo:

```js
if (isRealMarketplace) return []
```

### Desde RPC

```text
0 RPCs de availability ejecutadas
0 slots consultados desde availability_slots
```

No se puede hablar de cantidad real de filas `availability_slots` para Dennis desde este flujo, porque la app no consulta esa tabla.

### En marketplace card

`src/services/marketplaceService.js` normaliza:

```js
availabilityScore: 0
badge: {
  label: 'Sin horarios publicados',
  tone: 'neutral',
  level: 'low'
}
```

El contador visual de disponibilidad tambien queda en cero porque Marketplace Read no trae availability.

## 5. Condicion que produce "Sin horarios disponibles"

Archivo:

`src/pages/client/ClientDashboard.jsx`

La UI renderiza:

```js
{availableSlots.length > 0 ? (
  availableSlots.map(...)
) : (
  <strong>Sin horarios disponibles</strong>
)}
```

Condicion exacta:

```text
availableSlots.length === 0
```

En Marketplace real esa condicion siempre se cumple por:

```text
isRealMarketplace === true -> availableSlots = []
```

## 6. AppContext availability y booking actual

Archivo:

`src/contexts/AppContext.jsx`

### `getAvailableSlots()`

Fuente:

```text
agendaSettings.schedule
agendaSettings.blockedDates
agendaSettings.bookedSlots
adminState.artists
adminState.studios
```

No usa:

- `availability_slots`
- `schedules`
- `schedule_rules`
- `calendar_blocks`
- Supabase RPC

### `bookSlot()`

Escritura actual:

```js
setAgendaSettings((currentSettings) => ({
  ...currentSettings,
  bookedSlots: [...currentSettings.bookedSlots, slotWithClient],
}))
```

No escribe:

- `appointments`
- `appointment_status_events`
- `availability_slots.status`
- `appointment_economies`

## 7. ArtistAppointments / Generar nueva cita

Archivo:

`src/pages/artist/ArtistAppointments.jsx`

### Fuente de clientes

```js
const mockClients = ['Mariana L.', 'Camila R.', 'Ana G.', 'Renata M.']
```

El formulario muestra:

```jsx
<PanelHeader title="Nueva cita" eyebrow="Mock" />
```

### Fuente de listas

```js
const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
const artistAppointmentSource = realArtistAppointmentSourceReady
  ? realArtistAppointments
  : artistState.appointments
```

Lectura:

| Estado | Fuente |
|---|---|
| real loaded | `appointmentState.artistAppointments` |
| fallback | `artistState.appointments` |

### Escritura de nueva cita

`saveAppointment()` llama:

```text
addArtistAppointment()
bookSlot()
```

Eso escribe en:

```text
artistState.appointments
agendaSettings.bookedSlots
```

No escribe en Supabase.

## 8. ArtistDashboard / Generar cita

Archivo:

`src/pages/artist/ArtistDashboard.jsx`

### Import mock directo

```js
import { artistAppointments as mockArtistAppointments, recurringClients } from '../../services/mockData'
```

### Fuente de agenda

```js
const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
const artistAppointmentSource = realArtistAppointmentSourceReady
  ? realArtistAppointments
  : artistState.appointments
```

### Fuente de vista `citas`

La vista `citas` conserva fallback directo:

```text
realArtistAppointments si real ready
mockArtistAppointments si fallback
```

### Formulario de nueva cita

El panel muestra:

```jsx
<PanelHeader title="Nueva cita" eyebrow="Mock" />
```

`saveAppointment()` llama:

```text
addArtistAppointment()
bookSlot()
```

Ademas calcula economy y puntos en frontend/local:

```text
calculateAppointmentEconomy()
calculateFlowPoints()
addPointsToClient()
```

Todo sigue siendo local para crear citas.

## 9. Mock, demo y localStorage encontrados

| Fuente | Uso actual |
|---|---|
| `mockClients` en `ArtistAppointments.jsx` | Clientes del formulario Nueva cita. |
| `mockArtistAppointments` en `ArtistDashboard.jsx` | Fallback de vista citas. |
| `artistState.appointments` | Fallback de citas artista y escritura local. |
| `artistState.clients` | Clientes locales para ArtistDashboard. |
| `agendaSettings.bookedSlots` | Slots reservados locales. |
| `getAvailableSlots()` | Motor local de disponibilidad mock/demo. |
| `bookSlot()` | Escritura local de booked slots. |
| `studio-flow-artist-state` | localStorage de `artistState`, incluye appointments/clientes locales. |

Persistencia local:

```js
localStorage.setItem(artistStateStorageKey, JSON.stringify(artistState))
```

`agendaSettings.bookedSlots` no tiene persistencia propia; vive en React state runtime.

## 10. Separacion por capa

### Frontend

`ClientDashboard` ya usa Marketplace real para artistas/servicios, pero fuerza:

```text
availableSlots = []
```

`ArtistDashboard` y `ArtistAppointments` siguen mostrando formularios "Mock" y escribiendo local.

### AppContext

Mantiene:

- `getAvailableSlots()` local.
- `bookSlot()` local.
- `addArtistAppointment()` local.
- `artistState` persistido en localStorage.

No tiene:

- `loadMarketplaceAvailability()`.
- `createBooking()`.
- `createArtistAppointment()`.

### Service Layer

Existe:

- `marketplaceService.fetchMarketplaceListings()`.
- `appointmentService.fetchClientAppointments()`.
- `appointmentService.fetchArtistAppointments()`.

No existe:

- `availabilityService`.
- `bookingService`.
- write service de appointments.

### RPC

Existe:

- Marketplace Read.
- Appointments Read.

No existe:

- `studio_flow_marketplace_get_availability`.
- `studio_flow_client_book_appointment`.
- `studio_flow_artist_create_appointment`.

### Supabase

Existen tablas:

- `availability_slots`.
- `appointments`.
- `appointment_status_events`.
- `appointment_economies`.

Pero el flujo auditado no las usa para horarios ni escritura de nuevas citas.

## 11. Respuestas directas

### Por que Dennis publicada sigue sin mostrar horarios?

Porque Marketplace Read solo publica perfil y servicios.

La disponibilidad real no esta implementada:

```text
ClientDashboard real marketplace
  -> availableSlots = []
  -> Sin horarios disponibles
```

`availability_slots` no se consulta.

### Por que Generar cita sigue mostrando MOCK?

Porque los formularios de artista siguen usando el flujo legacy:

```text
mockClients
artistState.clients
artistState.appointments
addArtistAppointment()
bookSlot()
agendaSettings.bookedSlots
```

La etiqueta `Mock` esta en el propio `PanelHeader` del formulario.

### Existe escritura a Supabase al generar cita?

No.

Ni `ArtistDashboard.saveAppointment()` ni `ArtistAppointments.saveAppointment()` llaman un service/RPC de escritura real.

## Veredicto

Fase 17.7 y 17.8C resolvieron discovery/publicacion:

```text
Dennis visible
servicios reales visibles
```

Pero aun falta la siguiente frontera:

```text
Availability Read
Booking / Appointment Write
```

El bloqueo actual no es Dennis ni Marketplace Publication. El bloqueo actual es que el producto todavia no tiene conectada la ruta:

```text
availability_slots
  -> horarios cliente
  -> booking real
  -> appointments
```
