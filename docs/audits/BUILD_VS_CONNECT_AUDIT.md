# FASE 17.0B - BUILD VS CONNECT AUDIT

## Objetivo

Determinar si Studio Flow necesita construir infraestructura nueva o conectar infraestructura Supabase ya existente por dominio funcional.

Este documento no implementa codigo, no crea SQL, no crea RPCs y no modifica archivos. Solo auditoria.

## Veredicto ejecutivo

Studio Flow no necesita construir todo desde cero. La base de datos ya tiene una parte importante de la infraestructura:

- `appointments`
- `appointment_status_events`
- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `availability_slots`
- `favorite_artists`
- `studio_profiles`
- `appointment_economies`

El problema principal es de conexion:

```text
Tablas Supabase existen
  -> faltan RPCs operativas
  -> faltan service layers
  -> faltan loaders reales
  -> UI sigue usando AppContext/local state
```

Excepcion principal: `Notifications`, donde no se encontro tabla, RPC, service ni UI real. Ese dominio si requiere construccion nueva.

## DOMINIO: Appointments

Tabla:

SI

- `appointments` en `supabase/migrations/202606100005_milestone_05_appointments.sql:71`.
- `appointment_status_events` en `202606100005_milestone_05_appointments.sql:111`.
- `appointment_economies` en `202606100006_milestone_06_economy.sql:17`.
- `commissions` en `202606100006_milestone_06_economy.sql:46`.

RPC:

PARCIAL

- `studio_flow_admin_get_dashboard_summary` lee appointments para dashboard admin.
- `studio_flow_admin_get_clients` lee appointments para clientes admin.
- No se encontro RPC operacional para crear, actualizar, cancelar o listar appointments por cliente/artista.

Service:

PARCIAL

- `src/services/adminDashboardService.js` consume appointments desde summary admin.
- `src/services/adminClientService.js` consume conteos/historial de appointments para Admin Clients.
- No existe `appointmentService.js` ni service especifico de booking/appointments.

Loader:

PARCIAL

- `loadAdminDashboard()` carga appointments agregados para admin.
- `loadAdminClients()` carga historial/metricas cliente.
- No hay loader cliente/artista para appointments reales.

UI:

SI, pero local/parcial

- `AdminDashboard.jsx` muestra appointments reales desde dashboard summary.
- `ArtistDashboard.jsx` y `ArtistAppointments.jsx` usan `artistState.appointments` local.
- `ClientDashboard.jsx` usa `agendaSettings.bookedSlots` y `artistState.appointments` para citas visibles.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPCs de appointments operativas.
- Service layer dedicado.
- Loader para cliente/artista.
- Reemplazar `artistState.appointments` y `bookedSlots`.

Accion:

Conectar y completar.

---

## DOMINIO: Availability

Tabla:

SI

- `schedules` en `202606100004_milestone_04_scheduling.sql:34`.
- `schedule_rules` en `202606100004_milestone_04_scheduling.sql:55`.
- `calendar_blocks` en `202606100004_milestone_04_scheduling.sql:87`.
- `availability_slots` en `202606100004_milestone_04_scheduling.sql:103`.

RPC:

NO

No se encontro RPC `studio_flow_*availability*`, `studio_flow_*schedule*` o similar para consultar/generar slots.

Service:

NO

No se encontro service real de availability.

Loader:

NO

`getAvailableSlots()` vive en AppContext y calcula localmente.

UI:

SI, pero local

- `ClientDashboard.jsx` consulta `getAvailableSlots`.
- `QASandbox.jsx` muestra visual debug slots.
- `ArtistScheduleSettings.jsx` edita `agendaSettings` local.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPC/service para availability.
- Loader real.
- Reemplazar `agendaSettings` local.

Accion:

Conectar tablas existentes y construir RPC/service.

---

## DOMINIO: Booking

Tabla:

SI

- `appointments`.
- `availability_slots`.
- `appointment_economies`.
- `commissions`.
- `flow_point_ledger` puede integrarse despues para loyalty.

RPC:

NO

No se encontro RPC de booking como `studio_flow_client_book_appointment`, `studio_flow_create_booking` o equivalente.

Service:

NO

No existe booking service real.

Loader:

NO

`bookSlot()` en AppContext crea reservas locales.

UI:

SI, pero local

- `ClientDashboard.jsx` tiene flujo de booking publico.
- `ArtistDashboard.jsx` y `ArtistAppointments.jsx` pueden crear citas locales.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPC transaccional de booking.
- Service layer.
- Validacion de availability slot.
- Crear appointment real.
- Audit/economy/loyalty si aplica.

Accion:

Conectar infraestructura existente con RPC nueva.

---

## DOMINIO: Artist Schedule

Tabla:

SI

- `schedules`.
- `schedule_rules`.
- `calendar_blocks`.
- `availability_slots`.

RPC:

NO

No se encontro RPC para guardar/leer schedule de artista.

Service:

NO

No hay `artistScheduleService`.

Loader:

NO

`ArtistScheduleSettings.jsx` consume `agendaSettings` desde AppContext.

UI:

SI, local

- `src/pages/artist/ArtistScheduleSettings.jsx`.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPC read/write schedule.
- Service layer.
- Loader en AppContext o contexto separado.
- Migrar `agendaSettings`.

Accion:

Conectar tablas existentes.

---

## DOMINIO: Client Upcoming Appointments

Tabla:

SI

- `appointments`.
- `appointment_status_events`.
- `appointment_economies`.

RPC:

NO para cliente self-service

Existe lectura admin parcial:

- `studio_flow_admin_get_clients` genera historial/metricas desde appointments.

No se encontro RPC tipo `studio_flow_client_get_upcoming_appointments`.

Service:

NO para cliente

No existe `clientAppointmentService`.

Loader:

NO

`ClientDashboard.jsx` deriva citas desde:

- `agendaSettings.bookedSlots`
- `artistState.appointments`

UI:

SI, local

- `ClientDashboard.jsx` muestra proximas citas.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPC cliente para upcoming appointments.
- Service/loader real.
- Reemplazar `bookedSlots` y `artistState.appointments`.

Accion:

Conectar.

---

## DOMINIO: Artist Appointments

Tabla:

SI

- `appointments`.
- `appointment_status_events`.
- economy/trust related tables.

RPC:

NO

No se encontro RPC artist-scoped para listar/crear/cancelar appointments.

Service:

NO

No existe artist appointment service real.

Loader:

NO

`ArtistDashboard.jsx` y `ArtistAppointments.jsx` usan `artistState.appointments`.

UI:

SI, local

- `ArtistDashboard.jsx`.
- `ArtistAppointments.jsx`.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPC artist appointments.
- Service layer.
- Loader real.
- Reemplazar `addArtistAppointment` y `bookSlot`.

Accion:

Conectar.

---

## DOMINIO: Owner Appointment Visibility

Tabla:

SI

- `appointments`.
- `appointment_economies`.
- `artists`, `clients`, `studios`.

RPC:

SI

- `studio_flow_admin_get_dashboard_summary` devuelve appointments visibles por platform/studio scope.

Service:

SI

- `src/services/adminDashboardService.js`.

Loader:

SI

- `loadAdminDashboard()` en AppContext.

UI:

SI

- `AdminDashboard.jsx` usa `dashboardData.appointments`.

Clasificacion:

EXISTE COMPLETO para lectura dashboard owner

Que falta:

- No es un modulo completo de agenda owner.
- No cubre acciones sobre appointments.
- No reemplaza cliente/artista booking.

Accion:

Conectar/expandir solo si se necesita vista operacional mas profunda.

---

## DOMINIO: Notifications

Tabla:

NO

No se encontro tabla `notifications`, `notification_events`, `user_notifications` o similar.

RPC:

NO

No se encontro RPC de notifications.

Service:

NO

No existe notification service.

Loader:

NO

No hay loader de notifications.

UI:

NO real

Puede haber prompts PWA/update, pero no modulo de notificaciones de negocio.

Clasificacion:

NO EXISTE

Que falta:

- Definir modelo.
- Tabla(s).
- RPC/service.
- UI.

Accion:

Construccion nueva.

---

## DOMINIO: Favorites

Tabla:

SI

- `favorite_artists` en `202606100007_milestone_07_customer_360.sql:96`.

RPC:

NO

No se encontro RPC `studio_flow_*favorite*`.

Service:

NO

No existe favorite service.

Loader:

NO

`clientState.favoriteArtistIds` es local.

UI:

SI, local

- `ClientDashboard.jsx` tiene favoritos.
- Ruta `/client/favorites` existe.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPC toggle/list favorites.
- Service layer.
- Loader real.
- Reemplazar `clientState.favoriteArtistIds`.

Accion:

Conectar tabla existente.

---

## DOMINIO: Studio Profile

Tabla:

SI

- `studio_profiles` en `202606100002_milestone_02_studios_artists.sql:105`.

RPC:

PARCIAL/NO dedicada

No se encontro RPC dedicada:

- `studio_flow_admin_get_studio_profile`
- `studio_flow_admin_save_studio_profile`

Lectura parcial existe mediante:

- `studio_flow_admin_get_dashboard_summary`
- `studio_flow_admin_get_artists`
- `studio_flow_admin_clients_payload`

Service:

NO dedicado

No existe `adminStudioService.js`.

Loader:

NO dedicado

`AdminStudioProfile.jsx` usa `adminState.studios`.

UI:

SI, local

- `AdminStudioProfile.jsx`.
- `AdminArtists.jsx` tambien edita ubicacion de studio via `updateManagedStudioProfile`.

Clasificacion:

EXISTE PARCIAL

Que falta:

- RPC get/save studio profile.
- Service layer.
- Loader dedicado.
- Migrar `updateManagedStudioProfile`.

Accion:

Conectar tabla existente.

---

## Tabla resumen

| Dominio | Estado | Accion |
|---|---|---|
| Appointments | Parcial | Conectar/completar RPC + service |
| Availability | Parcial | Conectar tablas scheduling |
| Booking | Parcial | Construir RPC sobre tablas existentes |
| Artist Schedule | Parcial | Conectar schedules reales |
| Client Upcoming Appointments | Parcial | Conectar appointments reales |
| Artist Appointments | Parcial | Conectar appointments reales |
| Owner Appointment Visibility | Completo para lectura dashboard | Conectar/expandir |
| Notifications | No existe | Construccion nueva |
| Favorites | Parcial | Conectar `favorite_artists` |
| Studio Profile | Parcial | Conectar `studio_profiles` |

## Estimacion final

Sobre 10 dominios:

| Categoria | Dominios | Porcentaje |
|---|---:|---:|
| Ya construido completo | 1 | 10% |
| Parcialmente construido | 8 | 80% |
| No construido | 1 | 10% |

Si se evalua solo infraestructura de tablas Supabase:

| Categoria | Dominios | Porcentaje |
|---|---:|---:|
| Tablas ya existen | 9 | 90% |
| Tablas no existen | 1 | 10% |

Si se evalua conexion end-to-end UI -> service -> RPC -> Supabase:

| Categoria | Dominios | Porcentaje |
|---|---:|---:|
| Completo | 1 | 10% |
| Parcial | 8 | 80% |
| Inexistente | 1 | 10% |

## Camino correcto

El camino correcto es:

```text
RECONEXION primero
CONSTRUCCION NUEVA solo para Notifications
```

Studio Flow ya tiene la mayoria de las tablas necesarias. Lo que falta es conectar el producto real:

- RPCs transaccionales.
- Service layers.
- Loaders por rol.
- Sustitucion de `AppContext` local.
- Eliminacion de `bookedSlots`, `weeklySchedule`, `artistState.appointments` y `clientState.favoriteArtistIds` como fuentes productivas.

## Veredicto

No conviene reconstruir el sistema desde cero.

La infraestructura de persistencia ya existe en Supabase para appointments, scheduling, booking foundation, favorites y studio profiles. El trabajo principal es reconectar UI y AppContext a esa infraestructura mediante RPCs y services reales.

El unico dominio claramente no construido es Notifications.
