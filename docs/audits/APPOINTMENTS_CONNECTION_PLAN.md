# FASE 17.1 - APPOINTMENTS CONNECTION PLAN

## Objetivo

Generar un mapa de reconexion para que una cita creada por una clienta termine almacenada en `appointments` y sea visible para:

- Cliente.
- Artista.
- Studio Owner.
- Platform Owner.

Este documento no implementa codigo, no crea SQL, no crea RPCs y no modifica archivos. Solo plan tecnico de reconexion.

## Veredicto ejecutivo

La infraestructura base ya existe en Supabase:

- `appointments`
- `appointment_status_events`
- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `availability_slots`

El flujo de producto, sin embargo, sigue desconectado:

```text
ClientDashboard
  -> getAvailableSlots()
  -> agendaSettings.schedule
  -> agendaSettings.bookedSlots
  -> bookSlot()
  -> bookedSlots local
```

La cita no llega a `appointments`. Solo se agrega a `agendaSettings.bookedSlots`, y en flujos de artista tambien se duplica en `artistState.appointments`.

Conclusion:

```text
No es construccion desde cero.
Es reconexion sobre tablas existentes, con desarrollo nuevo significativo en RPC/service/loaders.
```

## 1. Flujo actual de booking

### Entrada desde cliente

Archivo:

`src/pages/client/ClientDashboard.jsx`

| Linea | Funcion/estado | Uso actual |
|---:|---|---|
| `416-422` | `agendaSettings`, `adminState`, `artistState`, `clientState`, `bookSlot`, `getAvailableSlots` | Consume todo desde `AppContext`. |
| `426` | `bookingDate = '2026-05-18'` | Fecha inicial hardcodeada/local. |
| `435-449` | `deriveMembershipsFromLegacyData`, `getArtistStudio`, `selectedArtistMembership`, `selectedArtistStudio` | Deriva studio/membership desde `adminState`. |
| `450-466` | `availableSlots` | Llama `getAvailableSlots(...)`. |
| `467-477` | `getVisibleSlotCountForArtist` | Calcula disponibilidad por artista con el mismo motor local. |
| `585-593` | `clientHistoryConnected` | Historial desde `artistState.appointments`. |
| `644-652` | `bookedAppointments`, `upcomingAppointments` | Proximas citas desde `agendaSettings.bookedSlots` + historial local. |
| `654-667` | `reserveSlot(slot)` | Llama `bookSlot(...)`. |
| `826-839` | Render de proximas citas | Renderiza `upcomingAppointments`. |
| `1390-1407` | Render de slots marketplace | Boton reserva llama `reserveSlot(slot)`. |
| `1543-1544` | Resumen | Copy reconoce `reservas mock`. |

Flujo actual:

```text
ClientDashboard
  -> selectedArtistProfile
  -> selectedArtistStudio / selectedArtistMembership
  -> getAvailableSlots({ artistId, studioId, membershipId, date, duration })
  -> availableSlots
  -> reserveSlot(slot)
  -> bookSlot(slot)
  -> agendaSettings.bookedSlots
```

### Motor local en AppContext

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Funcion/estado | Uso actual |
|---:|---|---|
| `3` | `weeklySchedule` desde `mockData` | Fuente base de agenda local. |
| `291-302` | `createInitialAgendaSettings()` | Crea `schedule`, `blockedDates`, `intervalMinutes`, `minAdvanceHours`, `bookedSlots`. |
| `620-634` | `hasDuplicateClientServiceBooking(...)` | Duplicados contra `bookedSlots` local. |
| `644` | `agendaSettings` | Estado React local. |
| `1356-1418` | `getAvailableSlots(...)` | Genera slots en frontend. |
| `1373` | `agendaSettings.blockedDates` | Bloqueo local por fecha. |
| `1376` | `agendaSettings.schedule` | Reglas semanales locales. |
| `1394-1398` | `agendaSettings.bookedSlots` | Marca slot ocupado localmente. |
| `1421-1460` | `bookSlot(slot)` | Agrega booking a `bookedSlots`. |
| `1431` | `clientId` desde `clientState.profile?.id` | No garantiza `clients.id` real. |
| `1455-1458` | `bookedSlots: [...currentSettings.bookedSlots, slotWithClient]` | Persistencia solo local. |
| `1764-1780` | `addArtistAppointment(...)` | Agrega cita a `artistState.appointments`. |

### Flujo artista paralelo

Archivos:

- `src/pages/artist/ArtistDashboard.jsx`
- `src/pages/artist/ArtistAppointments.jsx`

| Archivo | Linea | Uso actual |
|---|---:|---|
| `ArtistDashboard.jsx` | `77` | Consume `artistState`, `addArtistAppointment`, `bookSlot`. |
| `ArtistDashboard.jsx` | `153` | Citas del dia desde `artistState.appointments`. |
| `ArtistDashboard.jsx` | `185-244` | `saveAppointment()` crea cita local y llama `bookSlot`. |
| `ArtistAppointments.jsx` | `18` | Consume `artistState`, `addArtistAppointment`, `bookSlot`. |
| `ArtistAppointments.jsx` | `32-33` | Upcoming/past desde `artistState.appointments`. |
| `ArtistAppointments.jsx` | `57-71` | `saveAppointment()` llama `addArtistAppointment()` y `bookSlot()`. |

Problema:

```text
Cliente crea bookedSlot local.
Artista crea artistState.appointments local.
Ambos pueden llamar bookSlot().
Ninguno inserta appointments.
```

## 2. Fuentes locales que deben reemplazarse

| Fuente local | Archivo | Rol actual | Reemplazo objetivo |
|---|---|---|---|
| `weeklySchedule` | `src/services/mockData.js`, importado en `AppContext.jsx:3` | Agenda semanal demo. | `schedules` + `schedule_rules`. |
| `agendaSettings.schedule` | `AppContext.jsx:291-302` | Reglas semanales locales. | Lectura real de schedule/rules por artista o membership. |
| `agendaSettings.blockedDates` | `AppContext.jsx:299`, `1373` | Bloqueos locales. | `calendar_blocks`. |
| `agendaSettings.bookedSlots` | `AppContext.jsx:302`, `1394`, `1457` | Reservas/citas locales. | `appointments` + `availability_slots.status`. |
| `getAvailableSlots()` | `AppContext.jsx:1356-1418` | Motor frontend de disponibilidad. | Consulta real de `availability_slots` con scope/estado. |
| `bookSlot()` | `AppContext.jsx:1421-1460` | Inserta booking local. | Operacion transaccional que cree `appointments`. |
| `artistState.appointments` | `AppContext.jsx:1764-1780`, Artist UI | Agenda artista local. | Lectura real de `appointments` por artista/membership. |
| `clientHistoryConnected` | `ClientDashboard.jsx:585-593` | Historial desde `artistState.appointments`. | Historial real por `appointments.client_id`. |
| `bookingDate = '2026-05-18'` | `ClientDashboard.jsx:426` | Fecha inicial demo. | Fecha UI actual o default dinamico. |

## 3. Infraestructura real existente

### Scheduling y disponibilidad

Archivo:

`supabase/migrations/202606100004_milestone_04_scheduling.sql`

| Tabla | Linea | Participacion esperada |
|---|---:|---|
| `schedules` | `34` | Define agenda por `artist` o `membership`. |
| `schedule_rules` | `55` | Define reglas semanales por dia, horarios y descansos. |
| `calendar_blocks` | `87` | Bloquea rangos de tiempo por vacaciones, descansos, cierres o excepciones. |
| `availability_slots` | `103` | Fuente final para slots disponibles, held, booked, expired o hidden. |

Uso objetivo:

```text
schedules + schedule_rules + calendar_blocks
  -> generan o validan availability_slots
  -> cliente consulta slots available
  -> booking toma uno
  -> availability_slots.status = booked
```

### Appointments

Archivo:

`supabase/migrations/202606100005_milestone_05_appointments.sql`

| Tabla | Linea | Participacion esperada |
|---|---:|---|
| `appointments` | `71` | Registro canonico de la cita. |
| `appointment_status_events` | `111` | Bitacora de cambios de estado. |

Campos clave en `appointments`:

| Campo | Uso |
|---|---|
| `client_id` | Cliente que reserva. |
| `artist_id` | Artista que atiende. |
| `studio_id` | Studio donde ocurre, nullable para independiente si aplica. |
| `membership_id` | Relacion artista-studio, si aplica. |
| `service_offering_id` | Servicio reservado. |
| `availability_slot_id` | Slot tomado. Tiene constraint unico. |
| `starts_at`, `ends_at` | Tiempo real de cita. |
| `status` | `scheduled`, `completed`, `cancelled`, `no_show`, `disputed`. |
| `booking_source` | `client_portal`, `marketplace`, `artist`, `studio`, `admin`. |
| `created_by_profile_id` | Actor que creo la cita. |

Constraint importante:

```text
appointments_availability_slot_unique (availability_slot_id)
```

Esto ya protege contra doble reserva del mismo slot si el flujo real usa `availability_slot_id`.

### Lectura owner ya conectada parcialmente

| Capa | Archivo | Estado |
|---|---|---|
| RPC | `studio_flow_admin_get_dashboard_summary` | Lee `appointments` reales para dashboard admin. |
| Service | `src/services/adminDashboardService.js` | Consume summary real. |
| Loader | `loadAdminDashboard()` en `AppContext.jsx` | Carga dashboard real. |
| UI | `src/pages/admin/AdminDashboard.jsx` | Usa `dashboardData.appointments`. |

Owner visibility ya tiene base real para dashboard. Lo que falta es que la cita creada por cliente realmente entre a `appointments`.

## 4. Flujo objetivo de reconexion

### Booking cliente objetivo

```text
ClientDashboard
  -> seleccionar artista / servicio / fecha
  -> service de availability consulta slots reales
  -> UI muestra availability_slots disponibles
  -> cliente confirma slot
  -> service de booking ejecuta operacion transaccional
  -> se crea appointments
  -> se inserta appointment_status_events
  -> availability_slots pasa a booked
  -> loaders refrescan cliente/artista/admin
```

### Visibilidad esperada por rol

| Actor | Fuente objetivo | Filtro |
|---|---|---|
| Cliente | `appointments` | `client_id` del cliente autenticado. |
| Artista | `appointments` | `artist_id` o `membership_id` asociado al artista. |
| Studio Owner | `appointments` | `studio_id` dentro de su scope. |
| Platform Owner | `appointments` | Global. |

## 5. Tabla de reconexion

| Paso actual | Fuente actual | Fuente objetivo | Complejidad |
|---|---|---|---|
| Disponibilidad | `getAvailableSlots()` sobre `agendaSettings.schedule`, `blockedDates`, `bookedSlots` | Consulta real de `availability_slots` filtrada por artista/studio/membership/fecha/status, respaldada por `schedules`, `schedule_rules`, `calendar_blocks` | ALTA |
| Crear cita | `bookSlot()` agrega a `agendaSettings.bookedSlots` | Operacion transaccional: validar slot, insertar `appointments`, insertar `appointment_status_events`, marcar `availability_slots.status = booked` | ALTA |
| Proximas citas cliente | `agendaSettings.bookedSlots` + `artistState.appointments` | Consulta de `appointments` por `client_id`, `starts_at >= now`, `status in scheduled/disputed` segun producto | MEDIA |
| Historial cliente | `artistState.appointments` en `clientHistoryConnected` | Consulta de `appointments` por `client_id` con joins a artista, servicio, studio y economy | MEDIA |
| Citas artista | `artistState.appointments` | Consulta de `appointments` por `artist_id` o `membership_id`, fecha y status | MEDIA |
| Crear cita artista | `addArtistAppointment()` + `bookSlot()` | Mismo flujo transaccional de booking con `booking_source = artist` | ALTA |
| Dashboard owner | `appointments` via dashboard summary | `appointments` | BAJA |
| Ocupacion owner | Calculos dashboard sobre payload real/parcial | `appointments` + `availability_slots` por rango | MEDIA |

## 6. Complejidad por reconexion

### Disponibilidad - ALTA

Motivo:

- Hay tablas, pero no hay service/RPC conectado.
- Debe resolver timezone, artista independiente vs membership, bloqueos, duracion del servicio, slots expirados/held/booked.
- El frontend hoy genera slots; el flujo real debe consultar o generar desde Supabase.

Riesgo:

Si se conecta parcialmente, puede mostrar slots libres que ya estan tomados o slots de una agenda equivocada.

### Crear cita - ALTA

Motivo:

- Debe ser transaccional.
- Debe validar autenticacion, cliente real, artista real, servicio real, availability slot y scope.
- Debe evitar doble booking.
- Debe actualizar `availability_slots`.
- Debe crear `appointment_status_events`.

Riesgo:

Es la operacion core del producto. No conviene hacerla con inserts sueltos desde UI.

### Proximas citas cliente - MEDIA

Motivo:

- La tabla existe y la consulta es directa.
- Falta service/loader y mapper UI.
- Requiere decidir shape compatible con las cards actuales.

Riesgo:

Bajo si se mantiene read-only al inicio.

### Citas artista - MEDIA

Motivo:

- La tabla existe.
- Debe filtrar por artista/membership del actor autenticado.
- Falta reemplazar `artistState.appointments` y adaptar estados actuales.

Riesgo:

Medio porque Artist Dashboard calcula ocupacion, revenue y timeline desde ese estado.

### Owner visibility - BAJA

Motivo:

- `AdminDashboard` ya lee `appointments` reales mediante `studio_flow_admin_get_dashboard_summary`.
- `AdminClients` ya usa appointments para historial/metricas.

Riesgo:

El dashboard owner solo sera correcto cuando booking escriba citas reales.

## 7. Infraestructura faltante por capa

### RPC / backend

No se debe crear en esta fase, pero la reconexion necesita endpoints reales para:

| Necesidad | Fuente objetivo |
|---|---|
| Consultar disponibilidad | `availability_slots` + scheduling tables. |
| Crear booking cliente | `appointments`, `availability_slots`, `appointment_status_events`. |
| Listar citas cliente | `appointments` por cliente autenticado. |
| Listar citas artista | `appointments` por artista/membership. |
| Crear cita desde artista | Mismo backend de booking, con source `artist`. |
| Cambiar status | `appointments.status` + `appointment_status_events`. |

### Service layer

Faltan services dedicados o una separacion equivalente para:

| Service objetivo | Responsabilidad |
|---|---|
| appointment/booking service | Crear cita y consultar citas. |
| availability service | Consultar slots reales. |
| artist appointment service | Agenda artista real. |
| client appointment service | Proximas citas e historial cliente. |

### Loaders

| Loader objetivo | Reemplaza |
|---|---|
| `loadClientAppointments()` | `agendaSettings.bookedSlots` en cliente. |
| `loadArtistAppointments()` | `artistState.appointments`. |
| `loadAvailability()` o consulta por fecha/artista | `getAvailableSlots()`. |
| Refresh dashboard/admin tras booking | Dependencia indirecta del summary admin. |

## 8. Plan de reconexion recomendado

### Fase 1: Lecturas reales read-only

Objetivo:

- Mostrar proximas citas reales para cliente.
- Mostrar agenda real para artista.
- Mantener booking local temporalmente solo hasta conectar escritura.

Acciones conceptuales:

- Sustituir `upcomingAppointments` cliente por `appointments`.
- Sustituir `artistState.appointments` visual por `appointments`.
- Mantener empty states reales cuando no existan citas.

Complejidad:

MEDIA.

### Fase 2: Disponibilidad real

Objetivo:

- Reemplazar `getAvailableSlots()` por slots reales.

Acciones conceptuales:

- Consultar `availability_slots.status = available`.
- Respetar `schedule_id`, `artist_id`, `studio_id`, `membership_id`.
- Excluir slots expirados/held/booked/hidden.
- Mantener compatibilidad visual con `{ date, time, end, available, status }`.

Complejidad:

ALTA.

### Fase 3: Booking transaccional

Objetivo:

- Reemplazar `bookSlot()`.

Acciones conceptuales:

- Validar slot y actor.
- Crear `appointments`.
- Insertar `appointment_status_events`.
- Marcar `availability_slots` como `booked`.
- Refrescar cliente/artista/admin.

Complejidad:

ALTA.

### Fase 4: Eliminar fuentes locales

Objetivo:

- Retirar `bookedSlots` y `artistState.appointments` como fuente productiva.

Acciones conceptuales:

- `agendaSettings` queda solo para demo/dev hasta migrar Artist Schedule.
- Client/Artist UI ya no leen reservas locales.
- Admin owner sigue leyendo Supabase.

Complejidad:

MEDIA.

## 9. Respuesta directa

### ¿La funcionalidad ya esta construida y solo requiere reconexion?

Parcialmente.

La infraestructura de datos esta construida:

- scheduling
- availability slots
- appointments
- status events
- economy base

Pero la funcionalidad end-to-end de booking real no esta conectada.

### ¿Requiere desarrollo nuevo significativo?

Si, pero no como construccion de infraestructura desde cero.

Requiere desarrollo significativo en la capa de conexion:

- RPCs/operaciones transaccionales.
- Services frontend.
- Loaders por rol.
- Mappers compatibles con UI actual.
- Sustitucion de `agendaSettings`, `bookedSlots` y `artistState.appointments`.

## Tabla resumen

| Dominio | Estado actual | Accion |
|---|---|---|
| Disponibilidad | Tablas existen, UI local | Reconectar con complejidad ALTA |
| Booking cliente | UI existe, backend no conectado | Reconectar con operacion transaccional ALTA |
| Proximas citas cliente | UI existe, fuente local | Reconectar lectura MEDIA |
| Citas artista | UI existe, fuente local | Reconectar lectura/escritura MEDIA-ALTA |
| Owner visibility | Lectura admin ya conectada | Mantener y refrescar BAJA |
| Artist Schedule | Tablas existen, UI local | Reconectar despues o en paralelo ALTA |

## Veredicto

El camino correcto es:

```text
RECONEXION SOBRE INFRAESTRUCTURA EXISTENTE
```

No conviene reconstruir appointments, schedules ni availability. Ya existen en Supabase.

Lo que falta es convertir el flujo actual:

```text
bookSlot -> bookedSlots local
```

en:

```text
booking real -> appointments -> visible por cliente/artista/owner
```

La parte critica no es visual. Es garantizar una operacion transaccional de booking que use `availability_slots` y escriba `appointments` como fuente canonica.
