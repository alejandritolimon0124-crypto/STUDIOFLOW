# FASE 18.1 - SCHEDULE WRITE IMPLEMENTATION

## Objetivo

Implementar escritura real de configuracion de agenda para artista independiente.

Alcance aplicado:

- `schedules`.
- `schedule_rules`.
- `calendar_blocks` para fechas bloqueadas.
- generacion inicial de `availability_slots` para los proximos 14 dias.

No implementado:

- Booking Write.
- Appointment Write.
- Comisiones.
- Cobranza.

## Auditoria previa de esquema

Fuente:

`supabase/migrations/202606100004_milestone_04_scheduling.sql`

Tablas usadas:

| Tabla | Uso |
|---|---|
| `schedules` | Agenda por `owner_type = artist`. |
| `schedule_rules` | Reglas semanales por weekday. |
| `calendar_blocks` | Fechas bloqueadas de dia completo. |
| `availability_slots` | Slots generados para marketplace/availability read. |

Restricciones consideradas:

- `schedules_owner_check`.
- `schedule_rules_schedule_weekday_unique`.
- `schedule_rules_weekday_check`.
- `schedule_rules_work_hours_check`.
- `schedule_rules_break_check`.
- `availability_slots_time_check`.
- `availability_slots_held_until_check`.

## Migracion SQL

Archivo:

`supabase/migrations/202606110015_artist_schedule_write.sql`

Funciones creadas:

| Funcion | Uso |
|---|---|
| `studio_flow_artist_schedule_payload(p_artist_id uuid)` | Helper interno para normalizar agenda. |
| `studio_flow_artist_get_schedule_settings()` | Lectura real de agenda de artista autenticado. |
| `studio_flow_artist_save_schedule_settings(p_payload jsonb)` | Write path transaccional de agenda. |

### RPC principal

```text
studio_flow_artist_save_schedule_settings(p_payload jsonb)
```

Hace:

1. Valida `auth.uid()`.
2. Resuelve artista activo por `artists.profile_id = auth.uid()`.
3. Crea o actualiza `schedules.owner_type = artist`.
4. Reemplaza `schedule_rules` semanales.
5. Reemplaza `calendar_blocks` de fechas bloqueadas.
6. Elimina slots futuros `available/expired/hidden` del schedule.
7. Conserva slots `booked/held`.
8. Genera `availability_slots.status = available` para los proximos 14 dias.
9. Devuelve payload normalizado.

## Service Layer

Archivo:

`src/services/scheduleService.js`

Funciones:

```text
fetchArtistScheduleSettings()
saveArtistScheduleSettings(agendaSettings)
```

El service:

- normaliza payload Supabase a shape compatible con `agendaSettings`;
- conserva orden visual Lunes-Domingo;
- envia `schedule`, `blockedDates`, `intervalMinutes`, `minAdvanceHours`;
- no toca booking ni appointments.

## AppContext

Archivo:

`src/contexts/AppContext.jsx`

Agregado:

```text
isArtistScheduleLoading
artistScheduleError
artistScheduleStatus
```

Funciones:

```text
loadArtistScheduleSettings()
saveArtistScheduleSettings()
```

Reglas:

- En sesion real artista, intenta cargar agenda desde Supabase.
- Si Supabase responde `source = empty`, no pisa la UI actual antes del primer guardado.
- Al guardar, actualiza `agendaSettings` con la respuesta real.
- En mock session, conserva comportamiento demo.

## Frontend

Archivo:

`src/pages/artist/ArtistScheduleSettings.jsx`

Cambios:

- El boton `Guardar horarios` ahora ejecuta `saveArtistScheduleSettings`.
- Muestra loading:

```text
Guardando...
```

- Muestra error o exito:

```text
Agenda sincronizada
Horarios guardados. N slots generados.
```

## Validacion

Ejecutado:

```text
npm run build
```

Resultado:

- Build correcto.
- Vite compilo 141 modulos.
- PWA genero assets.
- Se mantiene advertencia existente de chunk mayor a 500 kB.

## Validacion esperada caso Dennis

Despues de aplicar migracion y pulsar `Guardar horarios` como Dennis:

```text
schedules > 0
schedule_rules > 0
availability_slots > 0
```

Despues, Mirna debe ver horarios si:

- Dennis esta publicada en Marketplace.
- Servicio seleccionado pertenece al listing.
- Slots generados tienen `status = available`.
- Fecha seleccionada coincide con los proximos 14 dias generados.

## Riesgos encontrados

| Riesgo | Estado |
|---|---|
| SQL no se valida con Vite | Pendiente aplicar migracion en Supabase para prueba DB real. |
| UI permite multiples bloques por dia, schema solo soporta un break por rule | La RPC guarda el primer bloque como break. |
| `calendar_blocks` se usa para fechas bloqueadas de dia completo | Correcto para alcance actual. |
| No se generan slots desde servicios/duracion | Se generan slots por intervalo; Availability Read filtra por duracion del servicio. |
| Slots booked/held se conservan | La RPC no borra `booked` ni `held`. |
| Si hay booked/held, los nuevos slots evitan overlaps con esos rangos | Implementado en generacion. |

## Veredicto

Schedule Write queda conectado:

```text
ArtistScheduleSettings
  -> AppContext.saveArtistScheduleSettings()
  -> scheduleService.saveArtistScheduleSettings()
  -> studio_flow_artist_save_schedule_settings()
  -> schedules / schedule_rules / calendar_blocks / availability_slots
```

La siguiente frontera sigue siendo:

```text
Booking Write
  -> tomar availability_slot
  -> appointments
  -> appointment_status_events
  -> appointment_economies
  -> availability_slots.status = booked
```
