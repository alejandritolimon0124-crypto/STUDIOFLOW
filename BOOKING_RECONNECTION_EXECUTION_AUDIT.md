# FASE 17.3 - BOOKING RECONNECTION EXECUTION AUDIT

## Objetivo

Preparar la ejecucion de la reconexion de booking/citas hacia Supabase, identificando exactamente que archivos y dependencias se tocaran.

Este documento no implementa codigo, no crea SQL, no crea RPCs y no modifica flujos productivos. Solo plan tecnico de ejecucion.

## Veredicto ejecutivo

La reconexion debe hacerse por cortes controlados. Hoy hay dos mundos:

```text
Cliente / Artista
  -> agendaSettings
  -> bookedSlots
  -> artistState.appointments
  -> getAvailableSlots()
  -> bookSlot()
  -> estado local
```

```text
Owner / Admin
  -> studio_flow_admin_get_dashboard_summary
  -> appointments reales
  -> AdminDashboard
```

Por eso no conviene eliminar `bookedSlots`, `artistState.appointments` o `getAvailableSlots()` de golpe. Primero hay que introducir lecturas reales compatibles, luego disponibilidad real, luego escritura real, y al final retirar los estados locales.

## 1. Inventario de archivos

### Disponibilidad

| Archivo | Lectura | Escritura | Dependencia AppContext | Dependencia Supabase | Estado |
|---|---|---|---|---|---|
| `src/contexts/AppContext.jsx` | Lee `agendaSettings`, `adminState.artists`, `adminState.studios` en `getAvailableSlots()` | No escribe disponibilidad real; solo calcula slots | Alta: `agendaSettings`, `getAvailableSlots` | Ninguna directa | LOCAL/LEGACY |
| `src/pages/client/ClientDashboard.jsx` | Lee `getAvailableSlots()` para slots marketplace y conteo por artista | No escribe disponibilidad | Alta: `getAvailableSlots`, `adminState` | Ninguna directa | LOCAL/LEGACY |
| `src/pages/admin/QASandbox.jsx` | Lee `agendaSettings` y `getAvailableSlots()` | No real; debug local | Alta | Ninguna directa | QA/DEV |
| `src/pages/artist/ArtistScheduleSettings.jsx` | Lee `agendaSettings.schedule`, `blockedDates`, reglas locales | Escribe agenda local mediante mutadores de AppContext | Alta | Ninguna directa | LOCAL/LEGACY |
| `supabase/migrations/202606100004_milestone_04_scheduling.sql` | Define estructura real | N/A | Ninguna | `schedules`, `schedule_rules`, `calendar_blocks`, `availability_slots` | REAL |

### Booking

| Archivo | Lectura | Escritura | Dependencia AppContext | Dependencia Supabase | Estado |
|---|---|---|---|---|---|
| `src/pages/client/ClientDashboard.jsx` | Lee `availableSlots` | Llama `bookSlot()` desde `reserveSlot()` | Alta: `bookSlot`, `getAvailableSlots`, `agendaSettings` | Ninguna directa | LOCAL/LEGACY |
| `src/contexts/AppContext.jsx` | Lee `agendaSettings.bookedSlots` para duplicados | Escribe `agendaSettings.bookedSlots` en `bookSlot()` | Nucleo actual | Ninguna directa | LOCAL/LEGACY |
| `src/pages/artist/ArtistDashboard.jsx` | Lee `artistState.appointments` | Llama `addArtistAppointment()` y `bookSlot()` | Alta | Ninguna directa | LOCAL/LEGACY |
| `src/pages/artist/ArtistAppointments.jsx` | Lee `artistState.appointments` | Llama `addArtistAppointment()` y `bookSlot()` | Alta | Ninguna directa | LOCAL/LEGACY |
| `supabase/migrations/202606100005_milestone_05_appointments.sql` | Define estructura real | N/A | Ninguna | `appointments`, `appointment_status_events` | REAL |

### Citas cliente

| Archivo | Lectura | Escritura | Dependencia AppContext | Dependencia Supabase | Estado |
|---|---|---|---|---|---|
| `src/pages/client/ClientDashboard.jsx` | `agendaSettings.bookedSlots`, `artistState.appointments`, `clientAppointments` mock | No escribe citas reales; booking via `bookSlot()` | Alta | Ninguna directa | LOCAL/MOCK/LEGACY |
| `src/services/adminClientService.js` | Admin clients lee metricas/historial desde RPC | No escribe appointments | Baja para cliente UI | RPC `studio_flow_admin_get_clients` | REAL para admin |
| `supabase/migrations/202606110009_admin_clients_real.sql` | Lee `appointments` para clientes admin | No booking | Ninguna | `appointments`, `appointment_economies` | REAL para admin |

### Citas artista

| Archivo | Lectura | Escritura | Dependencia AppContext | Dependencia Supabase | Estado |
|---|---|---|---|---|---|
| `src/pages/artist/ArtistDashboard.jsx` | `artistState.appointments` para agenda, ocupacion, revenue estimado | `addArtistAppointment()` + `bookSlot()` | Alta | Ninguna directa | LOCAL/LEGACY |
| `src/pages/artist/ArtistAppointments.jsx` | `artistState.appointments` para proximas/pasadas | `addArtistAppointment()` + `bookSlot()` | Alta | Ninguna directa | LOCAL/LEGACY |
| `src/layouts/DashboardLayout.jsx` | `artistState.appointments` para conteo por fecha | No | Media | Ninguna directa | LOCAL/LEGACY |
| `src/modules/automation/smartAutomationEngine.js` | `artistState.appointments` para automatizaciones | No | Indirecta | Ninguna directa | LOCAL/LEGACY |

### Dashboard owner

| Archivo | Lectura | Escritura | Dependencia AppContext | Dependencia Supabase | Estado |
|---|---|---|---|---|---|
| `src/services/adminDashboardService.js` | Normaliza `appointments` desde RPC | No | No directa | `studio_flow_admin_get_dashboard_summary` | REAL |
| `src/contexts/AppContext.jsx` | `loadAdminDashboard()` carga summary | Escribe `adminState.dashboard` | Media | RPC real | REAL |
| `src/pages/admin/AdminDashboard.jsx` | Lee `dashboardData.appointments` | No | Media: `adminState.dashboard` | Indirecta por service/RPC | REAL parcial |
| `supabase/migrations/202606110008_admin_dashboard_real_summary.sql` | Lee `appointments` y `appointment_economies` | No booking | Ninguna | Real | REAL |

## 2. Mapa de reemplazos

| Fuente actual | Fuente nueva | Complejidad | Comentario |
|---|---|---|---|
| `agendaSettings.schedule` | `schedules` + `schedule_rules` | ALTO | Debe soportar owner `artist` y `membership`, timezone y reglas semanales. |
| `agendaSettings.blockedDates` | `calendar_blocks` | MEDIO | Reemplazo directo conceptual, pero requiere mapping de fechas/rangos. |
| `agendaSettings.bookedSlots` | `appointments` + `availability_slots.status = booked` | ALTO | Es el corte mas sensible porque afecta cliente, artista y QA. |
| `getAvailableSlots()` | Service/RPC de disponibilidad sobre `availability_slots` | ALTO | Debe consultar slots reales y respetar status `available`, `held`, `booked`, `expired`, `hidden`. |
| `bookSlot()` | Service/RPC transaccional de booking sobre `appointments` | ALTO | Debe validar slot, crear appointment, insertar status event y marcar slot booked. |
| `artistState.appointments` | Loader/service de `appointments` por artista/membership | MEDIO | Lectura relativamente directa; la escritura debe ir por booking real. |
| `clientHistoryConnected` | Loader/service de historial `appointments` por cliente | MEDIO | Debe reemplazar lectura desde `artistState.appointments`. |
| `bookingDate = '2026-05-18'` | Fecha UI dinamica | BAJO | Cambio UI/local, no depende de Supabase. |

## 3. Dependencias criticas

### Si eliminamos hoy `bookedSlots`

Se rompen:

| Archivo | Linea | Efecto |
|---|---:|---|
| `src/contexts/AppContext.jsx` | `1394` | `getAvailableSlots()` ya no puede marcar slots ocupados. |
| `src/contexts/AppContext.jsx` | `1435`, `1445`, `1457` | `bookSlot()` pierde duplicados y persistencia local. |
| `src/pages/client/ClientDashboard.jsx` | `644` | Desaparecen proximas citas derivadas de reservas locales. |
| `src/pages/admin/QASandbox.jsx` | `68`, `265-266` | Visual Debug Slots y Reservas Activas dejan de funcionar. |

Impacto:

ALTO en Cliente y QA. Medio en Artista porque artista tambien usa `artistState.appointments`.

### Si eliminamos hoy `artistState.appointments`

Se rompen:

| Archivo | Linea | Efecto |
|---|---:|---|
| `src/pages/client/ClientDashboard.jsx` | `585` | Historial conectado cliente queda vacio/roto. |
| `src/pages/artist/ArtistDashboard.jsx` | `153` | Agenda del dia, ocupacion y revenue estimado dejan de funcionar. |
| `src/pages/artist/ArtistAppointments.jsx` | `32-33` | Proximas y pasadas desaparecen. |
| `src/layouts/DashboardLayout.jsx` | `180` | Conteo/layout de citas por fecha queda roto. |
| `src/modules/automation/smartAutomationEngine.js` | `331` | Automatizaciones basadas en citas locales pierden fuente. |

Impacto:

ALTO en Artist Dashboard y Artist Appointments.

### Si eliminamos hoy `getAvailableSlots()`

Se rompen:

| Archivo | Linea | Efecto |
|---|---:|---|
| `src/pages/client/ClientDashboard.jsx` | `450-477` | Marketplace no puede mostrar disponibilidad ni conteo por artista. |
| `src/pages/client/ClientDashboard.jsx` | `637` | Ranking/visibilidad de artistas por slots queda roto. |
| `src/pages/admin/QASandbox.jsx` | `93`, `113-118` | Debug de disponibilidad queda roto. |

Impacto:

ALTO en ClientDashboard. Bajo/DEV en QASandbox si se aisla.

## 4. Plan de corte

### PASO 1 - Introducir lecturas reales sin quitar legacy

Objetivo:

- Agregar fuente real de citas como lectura paralela.
- No tocar todavia `bookSlot()`.
- No retirar `bookedSlots` ni `artistState.appointments`.

Alcance conceptual:

| Modulo | Cambio esperado |
|---|---|
| Cliente | Loader de proximas citas reales desde `appointments`. |
| Artista | Loader de agenda real desde `appointments`. |
| Owner | Mantener `loadAdminDashboard()` como esta. |

Razon:

Permite validar shape de datos reales sin romper el booking local actual.

Riesgo:

MEDIO.

### PASO 2 - Reemplazar render read-only por fuente real

Objetivo:

- Cliente ve proximas citas desde `appointments`.
- Artista ve citas desde `appointments`.
- `bookedSlots` queda solo como fallback temporal o dev/demo.

Alcance conceptual:

| Pantalla | Reemplazo |
|---|---|
| `ClientDashboard.jsx` | `upcomingAppointments` deja de depender de `agendaSettings.bookedSlots`. |
| `ArtistDashboard.jsx` | `appointmentsForSelectedDate` deja de depender de `artistState.appointments`. |
| `ArtistAppointments.jsx` | `upcomingAppointments`/`pastAppointments` dejan de depender de `artistState.appointments`. |

Razon:

Antes de cambiar escritura, las pantallas ya deben estar listas para leer la fuente canonica.

Riesgo:

MEDIO-ALTO por mappers y empty states.

### PASO 3 - Conectar disponibilidad real

Objetivo:

- Reemplazar `getAvailableSlots()` para sesiones reales.
- Mantener motor local solo para demo/dev mientras se retira.

Alcance conceptual:

| Fuente actual | Nuevo comportamiento |
|---|---|
| `agendaSettings.schedule` | Solo demo/dev. |
| `agendaSettings.blockedDates` | Solo demo/dev. |
| `agendaSettings.bookedSlots` | No decide disponibilidad real. |
| `getAvailableSlots()` | Para sesion real, delega a availability real. |

Razon:

Si la disponibilidad sigue siendo local, el booking real puede reservar horarios que Supabase no reconoce.

Riesgo:

ALTO.

### PASO 4 - Reemplazar escritura de booking

Objetivo:

- Reemplazar `bookSlot()` para sesiones reales.
- Crear cita real en `appointments`.
- Insertar `appointment_status_events`.
- Marcar `availability_slots` como booked.
- Refrescar loaders de cliente, artista y admin.

Alcance conceptual:

| Fuente actual | Nuevo comportamiento |
|---|---|
| `bookSlot()` | Para sesion real llama booking real transaccional. |
| `addArtistAppointment()` | Para sesion real deja de escribir local y usa booking real con source `artist`. |
| `bookedSlots` | Solo demo/dev. |
| `artistState.appointments` | Solo demo/dev o cache derivado de Supabase. |

Razon:

Este es el corte final: despues de esto una cita creada por cliente/artista entra a Supabase.

Riesgo:

ALTO.

### PASO 5 - Retirar dependencias locales productivas

Objetivo:

- Eliminar o aislar `bookedSlots`, `artistState.appointments`, `getAvailableSlots()` local y `bookSlot()` local de sesiones reales.

Alcance conceptual:

| Dependencia | Destino |
|---|---|
| `bookedSlots` | DEV/demo only. |
| `artistState.appointments` | DEV/demo only o reemplazada por cache real. |
| `agendaSettings` | DEV/demo hasta migrar Artist Schedule real. |
| `QASandbox` | DEV only. |

Riesgo:

MEDIO si los pasos 1-4 ya estan completos.

## 5. Estimacion por reemplazo

| Reemplazo | Complejidad | Motivo |
|---|---|---|
| `agendaSettings.schedule` -> `schedules`/`schedule_rules` | ALTO | Requiere mapper de horario, timezone, owner artist/membership y persistencia real. |
| `agendaSettings.blockedDates` -> `calendar_blocks` | MEDIO | Modelo existe, pero hay que migrar fechas simples a rangos. |
| `agendaSettings.bookedSlots` -> `appointments`/`availability_slots` | ALTO | Impacta cliente, artista, QA y disponibilidad. |
| `getAvailableSlots()` -> availability real | ALTO | Core de marketplace/booking; debe ser consistente con slots reales. |
| `bookSlot()` -> booking real | ALTO | Operacion transaccional y fuente canonica del negocio. |
| `artistState.appointments` -> appointments reales | MEDIO | Lectura directa posible, pero muchas UI calculan sobre ese shape. |
| `clientHistoryConnected` -> appointments reales | MEDIO | Requiere joins/mapping a servicio, artista, puntos/economia. |
| Owner dashboard ya conectado | BAJO | Ya consume summary real; solo necesita que booking escriba appointments. |

## 6. Archivos que probablemente se tocaran en ejecucion

### Frontend services nuevos o extendidos

| Archivo | Accion esperada |
|---|---|
| `src/services/adminDashboardService.js` | Mantener; quizas refrescar tras booking. |
| `src/services/adminClientService.js` | Mantener para admin; no usar como client self-service. |
| `src/services/*appointment*` futuro | Service para citas cliente/artista. |
| `src/services/*availability*` futuro | Service para disponibilidad real. |
| `src/services/*booking*` futuro | Service para booking transaccional. |

### AppContext

| Archivo | Accion esperada |
|---|---|
| `src/contexts/AppContext.jsx` | Separar real vs demo en `getAvailableSlots`, `bookSlot`, `addArtistAppointment`, loaders de citas. |

### UI cliente/artista

| Archivo | Accion esperada |
|---|---|
| `src/pages/client/ClientDashboard.jsx` | Cambiar fuente de availability, booking, upcoming appointments e historial. |
| `src/pages/artist/ArtistDashboard.jsx` | Cambiar fuente de agenda/citas y escritura de nueva cita. |
| `src/pages/artist/ArtistAppointments.jsx` | Cambiar listas y guardado de cita. |
| `src/layouts/DashboardLayout.jsx` | Cambiar conteo por fecha desde citas reales. |

### QA/dev

| Archivo | Accion esperada |
|---|---|
| `src/pages/admin/QASandbox.jsx` | Aislar antes de retirar bookedSlots productivo. |
| `src/pages/artist/ArtistScheduleSettings.jsx` | Mantener local temporalmente o migrar en fase de schedule real. |

### Supabase ya existente

| Archivo | Accion esperada |
|---|---|
| `supabase/migrations/202606100004_milestone_04_scheduling.sql` | No tocar en esta fase de auditoria; fuente real para schedule/availability. |
| `supabase/migrations/202606100005_milestone_05_appointments.sql` | No tocar en esta fase de auditoria; fuente real para appointments/status events. |
| `supabase/migrations/202606110008_admin_dashboard_real_summary.sql` | Mantener lectura owner. |
| `supabase/migrations/202606110009_admin_clients_real.sql` | Mantener lectura admin clients. |

## 7. Reglas de seguridad para la ejecucion futura

1. No eliminar `bookedSlots` antes de que `ClientDashboard` lea citas reales.
2. No eliminar `artistState.appointments` antes de que `ArtistDashboard` y `ArtistAppointments` lean `appointments`.
3. No cambiar `bookSlot()` antes de tener disponibilidad real o validacion backend contra `availability_slots`.
4. No dejar booking real como insert directo desde UI.
5. No mezclar slots locales con slots Supabase en una misma sesion real.
6. Mantener demo/local solo si `session.isMockSession = true` o entorno dev.
7. Owner dashboard no necesita rediseño para esta reconexion; necesita datos reales entrando por booking.

## 8. Respuesta directa

### ¿Que se tocara?

Se tocaran principalmente:

- `AppContext.jsx`
- `ClientDashboard.jsx`
- `ArtistDashboard.jsx`
- `ArtistAppointments.jsx`
- services nuevos o extendidos para availability/booking/appointments
- posiblemente `DashboardLayout.jsx`
- aislamiento de `QASandbox.jsx`

### ¿Que no debe tocarse primero?

No debe tocarse primero:

- `AdminDashboard.jsx`, salvo refresh/mapper menor.
- `AdminDashboardService`, salvo compatibilidad.
- tablas base ya existentes.
- UI visual/layout.

### ¿Donde esta el corte mas riesgoso?

El corte mas riesgoso es:

```text
bookSlot()
  -> de bookedSlots local
  -> a booking transaccional real
```

Debe hacerse despues de tener lectura real y disponibilidad real.

## Veredicto

La ejecucion debe ser incremental:

```text
1. Lectura real de citas
2. Render real cliente/artista
3. Disponibilidad real
4. Booking real
5. Retiro de fuentes locales
```

Si se intenta empezar eliminando `bookedSlots` o `artistState.appointments`, se rompe Cliente y Artista. Si se intenta empezar por `bookSlot()` sin availability real, se puede crear inconsistencia entre UI y Supabase.

La estrategia correcta es reconectar primero lectura, luego disponibilidad, y finalmente escritura transaccional.
