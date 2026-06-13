# FASE 18.0 - AVAILABILITY READ IMPLEMENTATION

## Objetivo

Implementar lectura real de disponibilidad para Marketplace cliente.

Alcance aplicado:

- RPC read-only de availability.
- Service Layer.
- AppContext.
- ClientDashboard conectado a slots reales.
- Se elimina el bloqueo `if (isRealMarketplace) return []`.

No implementado:

- Booking Write.
- Appointment Write.
- Economy.
- Comisiones.
- Generacion automatica de slots.

## Auditoria previa de esquema

Fuente:

`supabase/migrations/202606100004_milestone_04_scheduling.sql`

Tablas auditadas:

| Tabla | Uso |
|---|---|
| `schedules` | Agenda fuente por `artist` o `membership`. |
| `schedule_rules` | Reglas semanales. No se consulta directamente en esta fase. |
| `calendar_blocks` | Bloqueos. No se consulta directamente en esta fase. |
| `availability_slots` | Fuente real de horarios disponibles. |

Columnas usadas de `availability_slots`:

| Columna | Uso |
|---|---|
| `id` | `availabilitySlotId`. |
| `schedule_id` | Relacion con agenda. |
| `artist_id` | Scope artista independiente. |
| `studio_id` | Scope studio si aplica. |
| `membership_id` | Scope membership si aplica. |
| `starts_at` | Inicio del slot. |
| `ends_at` | Fin del slot. |
| `status` | Debe ser `available`. |

## Migracion SQL

Archivo:

`supabase/migrations/202606110014_marketplace_availability_read.sql`

RPC creada:

```text
studio_flow_marketplace_get_availability(
  p_listing_id uuid,
  p_service_offering_id uuid default null,
  p_date date default current_date
)
```

Responsabilidades:

- Validar auth session.
- Validar listing visible.
- Validar marketplace profile visible.
- Resolver `artist_id`, `studio_id`, `membership_id`.
- Validar artista activo.
- Validar servicio activo si se envia `service_offering_id`.
- Validar que el servicio pertenezca al listing.
- Consultar `availability_slots.status = available`.
- Filtrar por fecha en `America/Mexico_City`.
- Devolver slots normalizados.

No escribe:

- `appointments`.
- `appointment_status_events`.
- `availability_slots`.

## Service Layer

Archivo:

`src/services/availabilityService.js`

Funcion:

```text
fetchMarketplaceAvailability({ listingId, serviceOfferingId, date })
```

Normaliza cada slot a:

```text
availabilitySlotId
listingId
artistId
studioId
membershipId
serviceOfferingId
startsAt
endsAt
date
time
end
durationMinutes
available
status
```

## AppContext

Archivo:

`src/contexts/AppContext.jsx`

Agregado:

```text
availabilityState = {
  slots: [],
  requestKey: '',
  loaded: false
}
```

Estados auxiliares:

```text
isAvailabilityLoading
availabilityError
```

Loader:

```text
loadMarketplaceAvailability({ listingId, serviceOfferingId, date })
```

Reglas:

- Solo corre para sesiones reales `client`.
- No corre para mock.
- No escribe bookings.
- Expone `marketplaceAvailabilitySlots`.

## Frontend

Archivo:

`src/pages/client/ClientDashboard.jsx`

Antes:

```js
if (isRealMarketplace) return []
```

Ahora:

```text
si Marketplace real:
  availableSlots = marketplaceAvailabilitySlots
si mock:
  availableSlots = getAvailableSlots()
```

El componente carga disponibilidad real cuando cambian:

- listing seleccionado.
- servicio seleccionado.
- fecha seleccionada.

Payload usado:

```text
listingId = selectedArtistProfile.listingId
serviceOfferingId = selectedMarketplaceService.id
date = bookingDate
```

## Booking deshabilitado en esta fase

Para cumplir el alcance:

```text
No crear citas
No reservar
Solo lectura de disponibilidad
```

Los slots reales se muestran, pero el boton de cada slot queda deshabilitado en Marketplace real y muestra:

```text
Disponible
```

`bookSlot()` no se usa para sesiones reales desde esta lectura.

## Validacion

Ejecutado:

```text
npm run build
```

Resultado:

- Build correcto.
- Vite compilo 140 modulos.
- PWA genero assets.
- Se mantiene advertencia existente de chunk mayor a 500 kB.

## Resultado esperado para Dennis

Si Dennis tiene filas en `availability_slots` que cumplen:

```text
status = available
artist_id = Dennis
fecha seleccionada = starts_at en America/Mexico_City
duracion del slot >= duracion del servicio
listing visible
service_offering active y compatible
```

Mirna debe ver horarios disponibles en el perfil de Dennis.

Si sigue viendo:

```text
Sin horarios disponibles
```

la siguiente validacion debe revisar datos:

- filas reales en `availability_slots`;
- fecha exacta seleccionada;
- `artist_id` / `membership_id` de los slots;
- duracion de slot vs servicio;
- status `available`;
- timezone de `starts_at`.

## Riesgos encontrados

| Riesgo | Estado |
|---|---|
| La RPC depende de slots ya generados | Intencional; esta fase no genera availability. |
| La fecha inicial sigue siendo `2026-05-18` | Si los slots estan en otra fecha, la UI mostrara vacio. |
| No hay booking real | Intencional; botones de slots reales no reservan. |
| No se consultan `schedule_rules` ni `calendar_blocks` | Esta fase lee slots precomputados desde `availability_slots`. |
| Timezone puede filtrar slots fuera del dia esperado | Se usa `America/Mexico_City` para alinear con la UI actual. |

## Veredicto

Availability Read queda conectado:

```text
ClientDashboard
  -> AppContext.loadMarketplaceAvailability()
  -> availabilityService.fetchMarketplaceAvailability()
  -> studio_flow_marketplace_get_availability()
  -> availability_slots
```

La siguiente frontera sigue siendo:

```text
Booking Write
  -> appointments
  -> appointment_status_events
  -> appointment_economies
  -> availability_slots.status = booked
```
