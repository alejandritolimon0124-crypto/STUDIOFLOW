# FASE 18.2C - APPOINTMENT CANDIDATES IMPLEMENTATION

## Objetivo

Reemplazar la lectura de slots tecnicos por candidatos de inicio de cita.

Alcance aplicado:

- `studio_flow_marketplace_get_availability()` devuelve appointment start candidates.
- ClientDashboard ya no inicia con fecha hardcodeada.
- ClientDashboard se mueve automaticamente al primer dia con disponibilidad devuelto por la RPC.

No implementado:

- Booking Write.
- Appointment Write.
- Economy.
- Comisiones.

## Problema corregido

Antes, la RPC filtraba:

```sql
slot_duration >= service_duration
```

Eso eliminaba todos los slots si:

```text
slot = 15 min
service = 60-120 min
```

Ahora los slots de 15 minutos se tratan como unidades de disponibilidad y la RPC devuelve inicios validos de servicio.

## RPC

Archivo:

`supabase/migrations/202606110014_marketplace_availability_read.sql`

RPC actualizada:

```text
studio_flow_marketplace_get_availability(
  p_listing_id uuid,
  p_service_offering_id uuid default null,
  p_date date default current_date
)
```

### Algoritmo

Para cada slot disponible como candidato inicial:

```text
candidate_end = slot.starts_at + service_duration
```

Luego valida:

- slots `available`;
- mismo artista/membership;
- sin gaps entre `ends_at` y el siguiente `starts_at`;
- cobertura hasta `candidate_end`;
- `starts_at >= now()`.

Si la cobertura es suficiente, devuelve un candidato:

```json
{
  "start": "...",
  "end": "10:30",
  "durationMinutes": 90,
  "availabilitySlotIds": ["..."],
  "available": true
}
```

## Fecha default

Archivo:

`src/pages/client/ClientDashboard.jsx`

Antes:

```js
useState('2026-05-18')
```

Ahora:

```text
bookingDate = fecha local actual
```

Regla implementada:

- Si la RPC devuelve candidatos en una fecha posterior, `ClientDashboard` mueve `bookingDate` a esa fecha.
- Los inputs de fecha tienen `min = fecha actual`.
- No quedan fechas hardcodeadas para Marketplace booking date.

## Service Layer

Archivo:

`src/services/availabilityService.js`

Actualizado para normalizar:

- `availabilitySlotIds`
- `start`
- `startsAt`
- `endsAt`
- `durationMinutes`
- `requestedDate`

El service no filtra candidatos.

## AppContext

Archivo:

`src/contexts/AppContext.jsx`

`availabilityState` ahora conserva:

```text
slots
requestKey
date
durationMinutes
loaded
```

Esto permite que ClientDashboard detecte cuando la RPC encontro disponibilidad en una fecha posterior.

## Frontend

Archivo:

`src/pages/client/ClientDashboard.jsx`

Ahora renderiza:

```text
marketplaceAvailabilitySlots
```

que ya no son slots tecnicos de 15 minutos, sino candidatos de cita.

Los botones siguen deshabilitados en Marketplace real porque Booking Write no pertenece a esta fase.

## Ejemplo Dennis

Slots:

```text
09:00-09:15
09:15-09:30
09:30-09:45
09:45-10:00
10:00-10:15
10:15-10:30
```

Servicio:

```text
90 min
```

Resultado esperado:

```text
09:00-10:30 disponible
```

Payload:

```json
{
  "time": "09:00",
  "end": "10:30",
  "durationMinutes": 90,
  "availabilitySlotIds": ["slot1", "slot2", "slot3", "slot4", "slot5", "slot6"],
  "available": true
}
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

## Resultado esperado

Caso Dennis:

```text
availability_slots: 2026-06-15 -> 2026-06-26
bookingDate inicial: fecha local actual
RPC busca candidatos desde esa fecha
RPC devuelve primer dia con candidatos
ClientDashboard mueve bookingDate a ese dia
Mirna ve horarios disponibles
```

## Riesgos

| Riesgo | Estado |
|---|---|
| SQL no se valida con Vite | Pendiente de aplicar migracion en Supabase. |
| La RPC repite CTEs para elegir fecha y devolver candidatos | Correcto para alcance; puede optimizarse luego. |
| No hay booking write | Intencional; candidatos incluyen `availabilitySlotIds` para la siguiente fase. |
| Si hay gaps reales, el candidato no se devuelve | Intencional. |

## Veredicto

Availability Read ahora devuelve disponibilidad reservable:

```text
availability_slots tecnicos
  -> cobertura continua
  -> appointment start candidates
  -> ClientDashboard
```

La siguiente fase puede tomar:

```text
availabilitySlotIds + serviceOfferingId
```

para implementar Booking Write real.
