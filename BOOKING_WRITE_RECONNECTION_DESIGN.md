# FASE 17.6 - BOOKING WRITE RECONNECTION DESIGN

## Objetivo

Disenar la migracion completa para crear citas reales en Supabase desde el flujo de Marketplace/booking.

Este documento no implementa codigo, no crea SQL/RPC y no modifica archivos productivos. Solo audita estructura existente y define el diseno objetivo.

## Veredicto ejecutivo

La base para escribir citas reales ya existe:

- `appointments`
- `appointment_status_events`
- `appointment_economies`
- `availability_slots`
- `service_offerings`

Pero el flujo actual no tiene dos piezas indispensables para un booking real:

1. `availability_slot_id`
2. `service_offering_id`

Hoy `ClientDashboard` reserva por:

```text
artistId + studioId + membershipId + date + time + service name + duration
```

Eso sirve para UI local, pero no basta para insertar una cita robusta en Supabase. El flujo real debe moverse a:

```text
availability_slot_id + service_offering_id
  -> RPC transaccional
  -> appointments
  -> appointment_status_events
  -> appointment_economies
  -> availability_slots.status = booked
```

## 1. Auditoria Supabase

### `appointments`

Archivo:

`supabase/migrations/202606100005_milestone_05_appointments.sql`

| Campo | Obligatorio | Default | FK | Nota |
|---|---|---|---|---|
| `id` | No | `gen_random_uuid()` | No | PK. |
| `client_id` | Si | No | `clients(id)` | Cliente real que reserva. |
| `artist_id` | Si | No | `artists(id)` | Artista real. |
| `studio_id` | No | No | `studios(id)` | Obligatorio de facto si hay `membership_id`. |
| `membership_id` | No | No | `artist_studio_memberships(id)` | Si existe, exige `studio_id`. |
| `service_offering_id` | Si | No | `service_offerings(id)` | Servicio real reservado. |
| `availability_slot_id` | No | No | `availability_slots(id)` | Nullable, pero debe usarse para evitar doble booking. |
| `marketplace_listing_id` | No | No | `marketplace_listings(id)` | FK agregada en milestone 08. |
| `promotion_id` | No | No | `promotions(id)` | Opcional. |
| `starts_at` | Si | No | No | Inicio real timestamptz. |
| `ends_at` | Si | No | No | Fin real timestamptz. |
| `status` | Si | `scheduled` | Enum | Inicial esperado. |
| `booking_source` | Si | No | Enum | Para cliente marketplace: `marketplace` o `client_portal`. |
| `client_notes` | No | No | No | Opcional. |
| `created_by_profile_id` | No | No | `profiles(id)` | Debe ser `auth.uid()`. |
| `created_at` | Si | `now()` | No | Sistema. |
| `updated_at` | Si | `now()` | No | Sistema. |
| `completed_at` | No | No | No | Requerido solo si status `completed`. |
| `cancelled_at` | No | No | No | Requerido solo si status `cancelled`. |

Restricciones:

| Restriccion | Efecto |
|---|---|
| `appointments_availability_slot_unique` | Solo una cita por `availability_slot_id`. |
| `appointments_time_check` | `ends_at > starts_at`. |
| `appointments_membership_studio_check` | Si hay `membership_id`, debe haber `studio_id`. |
| `appointments_completed_at_check` | Si status es `completed`, requiere `completed_at`. |
| `appointments_cancelled_at_check` | Si status es `cancelled`, requiere `cancelled_at`. |

### `appointment_status_events`

Archivo:

`supabase/migrations/202606100005_milestone_05_appointments.sql`

| Campo | Obligatorio | Default | FK | Nota |
|---|---|---|---|---|
| `id` | No | `gen_random_uuid()` | No | PK. |
| `appointment_id` | Si | No | `appointments(id)` | Cita creada. |
| `from_status` | No | No | Enum | Para creacion inicial: `null`. |
| `to_status` | Si | No | Enum | Para booking: `scheduled`. |
| `reason` | No | No | No | Ej. `client_booking_created`. |
| `changed_by_profile_id` | No | No | `profiles(id)` | Actor. |
| `changed_at` | Si | `now()` | No | Sistema. |

### `appointment_economies`

Archivo:

`supabase/migrations/202606100006_milestone_06_economy.sql`

| Campo | Obligatorio | Default | FK | Nota |
|---|---|---|---|---|
| `id` | No | `gen_random_uuid()` | No | PK. |
| `appointment_id` | Si | No | `appointments(id)` | Unico por cita. |
| `gross_amount` | Si | No | No | Precio total. |
| `platform_fee_amount` | Si | No | No | Fee plataforma. |
| `artist_revenue_amount` | Si | No | No | Ingreso artista. |
| `studio_revenue_amount` | No | No | No | Opcional. |
| `currency` | Si | No | No | Recomendado `MXN`. |
| `calculation_status` | Si | `quoted` | Enum | Booking inicial. |
| `calculation_version` | Si | No | No | Ej. `booking_v1`. |
| `created_at` | Si | `now()` | No | Sistema. |
| `updated_at` | Si | `now()` | No | Sistema. |
| `earned_at` | No | No | No | Requerido solo si status `earned`. |
| `adjusted_at` | No | No | No | Opcional. |

Restricciones:

| Restriccion | Efecto |
|---|---|
| `appointment_economies_appointment_id_unique` | Una economia por cita. |
| `appointment_economies_amounts_check` | Montos >= 0. |
| `appointment_economies_earned_at_check` | Si `earned`, requiere `earned_at`. |

### `availability_slots`

Archivo:

`supabase/migrations/202606100004_milestone_04_scheduling.sql`

| Campo | Obligatorio | Default | FK | Nota |
|---|---|---|---|---|
| `id` | No | `gen_random_uuid()` | No | PK. |
| `schedule_id` | Si | No | `schedules(id)` | Agenda fuente. |
| `artist_id` | No | No | `artists(id)` | Puede venir del schedule. |
| `studio_id` | No | No | `studios(id)` | Scope studio. |
| `membership_id` | No | No | `artist_studio_memberships(id)` | Scope membership. |
| `starts_at` | Si | No | No | Inicio real. |
| `ends_at` | Si | No | No | Fin real. |
| `status` | Si | `available` | Enum | Debe pasar a `booked`. |
| `held_by_profile_id` | No | No | `profiles(id)` | Para hold futuro. |
| `held_until` | No | No | No | Requerido si status `held`. |
| `generated_at` | Si | `now()` | No | Sistema. |
| `created_at` | Si | `now()` | No | Sistema. |
| `updated_at` | Si | `now()` | No | Sistema. |

Restricciones:

| Restriccion | Efecto |
|---|---|
| `availability_slots_time_check` | `ends_at > starts_at`. |
| `availability_slots_held_until_check` | Si `held`, requiere `held_until`. |

## 2. Payload minimo para cita valida

### Payload minimo desde frontend hacia service/RPC

Para booking cliente real, el frontend deberia enviar solo identificadores y notas:

```json
{
  "availability_slot_id": "uuid",
  "service_offering_id": "uuid",
  "client_notes": "texto opcional",
  "booking_source": "marketplace"
}
```

Esto es deliberadamente pequeno. El backend debe resolver:

- `client_id` desde `auth.uid()`.
- `artist_id`, `studio_id`, `membership_id`, `starts_at`, `ends_at` desde `availability_slots`.
- precio, duracion y ownership desde `service_offerings`.
- `created_by_profile_id` desde `auth.uid()`.
- montos de economy desde `service_offerings.price_amount`.

### Payload minimo si aun no hay availability real

Como puente temporal, menos ideal:

```json
{
  "artist_id": "uuid",
  "studio_id": "uuid|null",
  "membership_id": "uuid|null",
  "service_offering_id": "uuid",
  "starts_at": "timestamptz",
  "ends_at": "timestamptz",
  "client_notes": "texto opcional",
  "booking_source": "marketplace"
}
```

Riesgo:

Sin `availability_slot_id`, no se aprovecha `appointments_availability_slot_unique`. El backend tendria que hacer una validacion temporal por overlap, que hoy no existe como constraint.

Recomendacion:

Usar `availability_slot_id` como requisito para booking real.

## 3. Datos disponibles hoy en frontend

### Ya existen en `ClientDashboard`

| Dato | Fuente actual | Validez para booking real |
|---|---|---|
| `artistId` | `selectedArtistProfile.id` | Util si es UUID real. |
| `studioId` | `selectedArtistStudio?.id` | Util si viene de Supabase. |
| `membershipId` | `selectedArtistMembership?.id` | Util si viene de Supabase. |
| `date` | `bookingDate` | UI local. |
| `time` / `end` | `getAvailableSlots()` local | No suficiente para booking real. |
| `service` | `marketplaceService.name` | Nombre, no FK. |
| `durationMinutes` | `marketplaceService.durationMinutes` | Local/static. |

### Faltan para booking real

| Dato faltante | Por que importa |
|---|---|
| `availability_slot_id` | Bloquea doble reserva y da timestamps canonicos. |
| `service_offering_id` | FK obligatoria en `appointments`. |
| `client_id` real | No debe venir de `clientState.profile.id` mock; backend debe resolverlo. |
| `starts_at`/`ends_at` canonicos | Deben venir del slot real, no de strings locales. |
| precio real | Debe venir de `service_offerings.price_amount`. |
| moneda | Debe decidir backend, probablemente `MXN`. |

### Problema especifico del Marketplace actual

`ClientDashboard` usa servicios estaticos:

```text
searchServices -> allSearchServices -> marketplaceService
```

y `artistMarketplaceProfile` devuelve nombres de servicios:

```text
marketplaceServices: ['Lash lifting', 'Brow design', ...]
```

Eso no contiene `service_offering_id`.

En cambio, `artistServiceService.js` si normaliza servicios reales con:

```text
id
price
duration
serviceTier
```

Pero esos servicios reales no estan conectados al marketplace cliente como fuente principal.

## 4. Flujo objetivo

```text
Cliente autenticada
  -> Marketplace real
  -> selecciona artista/listing
  -> selecciona service_offering real
  -> selecciona availability_slot real
  -> bookSlot()
  -> bookingService.createAppointment()
  -> RPC SECURITY DEFINER
  -> valida auth.uid()
  -> resuelve client_id
  -> lock availability_slot for update
  -> valida status available
  -> valida service_offering activo y compatible
  -> insert appointments
  -> insert appointment_status_events
  -> insert appointment_economies
  -> update availability_slots status booked
  -> retorna appointment normalizado
  -> refresca ClientDashboard / Artist / Admin
```

## 5. Diseno por capa

### Frontend

Responsabilidad:

- No construir SQL mental.
- No decidir montos financieros.
- No confiar en strings de servicio como identidad.
- Enviar IDs reales.

Cambios de diseno necesarios:

| Area | Cambio |
|---|---|
| Marketplace services | Reemplazar `searchServices`/nombres por `service_offerings` reales o mapearlos a servicios reales. |
| Slots | Reemplazar slots locales por `availability_slots` reales con `id`. |
| Boton Reservar | Llamar a `bookSlot()` con `availabilitySlotId` y `serviceOfferingId`. |
| Empty states | Si no hay slots reales, mostrar no disponibilidad real. |

Payload UI objetivo:

```js
bookSlot({
  availabilitySlotId: slot.id,
  serviceOfferingId: selectedService.id,
  clientNotes,
})
```

### AppContext

Responsabilidad:

- Mantener compatibilidad demo/local.
- Para sesiones reales, delegar a service layer.
- Refrescar loaders reales despues del booking.

Diseno:

```text
bookSlot(slot)
  if session.isMockSession:
    usar agendaSettings.bookedSlots
  else:
    createBooking(slot)
    loadClientAppointments()
    loadArtistAppointments() si aplica
    loadAdminDashboard() si rol admin/owner aplica o invalidar cache
```

Regla:

No mezclar `bookedSlots` con booking real en sesiones reales.

### Service Layer

Archivo objetivo sugerido:

`src/services/bookingService.js`

Funcion objetivo:

```text
createBooking({ availabilitySlotId, serviceOfferingId, clientNotes, bookingSource })
```

Debe:

- validar que existan IDs minimos antes de RPC.
- llamar RPC.
- mapear respuesta al shape de `appointmentService.normalizeAppointment`.
- no calcular economy en frontend.

### RPC

RPC objetivo sugerido:

```text
studio_flow_client_book_appointment(p_booking jsonb)
```

Validaciones:

| Validacion | Fuente |
|---|---|
| `auth.uid()` existe | Auth |
| profile activo | `profiles` |
| client activo | `clients.profile_id = auth.uid()` |
| slot existe | `availability_slots` |
| slot status `available` | `availability_slots.status` |
| slot no expirado/held | `held_until`, status |
| service existe y activo | `service_offerings` |
| service compatible con slot | artist/membership/studio |
| artist activo | `artists.status` |
| membership activo si aplica | `artist_studio_memberships.status` |
| studio no suspendido si aplica | `studios.studio_status` |

Operacion transaccional:

1. `select availability_slots ... for update`.
2. Validar `status = 'available'`.
3. Resolver `client_id`.
4. Resolver `service_offering`.
5. Insertar `appointments`.
6. Insertar `appointment_status_events`.
7. Insertar `appointment_economies`.
8. Opcional: insertar `commissions`.
9. Actualizar `availability_slots.status = 'booked'`.
10. Retornar cita con el mismo shape que `studio_flow_get_client_appointments`.

Orden recomendado:

```text
lock slot
insert appointment
insert status event
insert economy
update slot booked
return appointment json
```

Nota:

La constraint `appointments_availability_slot_unique` protege doble cita con el mismo slot, pero el `for update` y status check dan mejor error de negocio.

### Supabase

No se necesitan tablas nuevas para primera version.

Fuentes ya existentes:

| Necesidad | Tabla |
|---|---|
| cliente | `clients` |
| artista | `artists` |
| studio/membership | `studios`, `artist_studio_memberships` |
| servicio | `service_offerings` |
| slot | `availability_slots` |
| cita | `appointments` |
| status event | `appointment_status_events` |
| economy | `appointment_economies` |
| commission opcional | `commissions` |

## 6. Economy inicial

Para MVP de booking:

| Campo | Regla recomendada |
|---|---|
| `gross_amount` | `service_offerings.price_amount` |
| `platform_fee_amount` | `round(gross_amount * 0.10)` |
| `artist_revenue_amount` | `gross_amount - platform_fee_amount` |
| `studio_revenue_amount` | `null` hasta definir split studio |
| `currency` | `MXN` |
| `calculation_status` | `quoted` |
| `calculation_version` | `booking_v1` |

Commission opcional pero consistente con tabla:

| Campo | Regla |
|---|---|
| `amount` | `platform_fee_amount` |
| `rate` | `0.10` |
| `currency` | `MXN` |
| `status` | `potential` |

## 7. Plan de implementacion por fases

### Fase 1: Preparar fuentes reales de seleccion

Objetivo:

- Marketplace debe seleccionar servicios reales y slots reales.

Cambios:

- Service de availability read.
- Service/listado de services por artista/membership para cliente.
- UI conserva visual actual, pero cada opcion debe tener `serviceOfferingId`.
- Cada slot debe tener `availabilitySlotId`.

Riesgo:

ALTO si se intenta reservar con servicios por nombre.

### Fase 2: Crear service layer de booking

Objetivo:

- Agregar service frontend para llamar la RPC futura.

Contrato:

```js
createBooking({
  availabilitySlotId,
  serviceOfferingId,
  clientNotes,
  bookingSource: 'marketplace',
})
```

Riesgo:

MEDIO. Es un wrapper, la complejidad vive en backend.

### Fase 3: RPC transaccional

Objetivo:

- Crear la cita real.

Debe escribir:

- `appointments`
- `appointment_status_events`
- `appointment_economies`
- `availability_slots.status = booked`

Riesgo:

ALTO. Es el punto critico del producto.

### Fase 4: Conectar `bookSlot()` real

Objetivo:

- En sesiones reales, `bookSlot()` deja de escribir `agendaSettings.bookedSlots`.
- En sesiones mock, conserva comportamiento local.

Post booking:

- refrescar `loadClientAppointments()`.
- refrescar `loadArtistAppointments()` si corresponde.
- no depender de fallback local.

Riesgo:

MEDIO-ALTO.

### Fase 5: Retirar fallback productivo

Objetivo:

- `bookedSlots` solo demo/dev.
- `artistState.appointments` solo demo/dev.
- Cliente y artista leen `appointments`.

Riesgo:

MEDIO si fases previas estan completas.

## 8. Reglas de corte

1. No implementar booking real sin `service_offering_id`.
2. No implementar booking real sin `availability_slot_id`, salvo puente temporal claramente marcado.
3. No calcular economy en frontend.
4. No insertar `appointments` directamente desde UI.
5. No confiar en `clientState.profile.id` como `client_id` real.
6. No mezclar `bookedSlots` y `appointments` en sesiones reales.
7. Mantener demo solo con `session.isMockSession`.

## Veredicto

La migracion de escritura no requiere tablas nuevas para la primera version. Requiere conectar correctamente IDs reales y crear una RPC transaccional.

El minimo solido es:

```text
availability_slot_id
service_offering_id
auth.uid()
```

Con eso el backend puede resolver el resto:

```text
client_id
artist_id
studio_id
membership_id
starts_at
ends_at
precio
economy
status event
```

El mayor trabajo previo no es visual, sino reemplazar la seleccion actual basada en nombres/slots locales por seleccion real basada en `service_offerings` y `availability_slots`.

